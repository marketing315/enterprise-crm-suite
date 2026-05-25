/**
 * VoiSpeed IVR Sync (F6 Step #2)
 *
 * Daily cron-driven adapter that fetches the IVR tree from VoiSpeed SERI for
 * every brand with `voispeed_configs.enabled = true` and upserts it into
 * `public.voispeed_ivr_nodes`.
 *
 * Auth: x-cron-secret (with rotation).
 *
 * Tolerates JSON or XML responses. Per-brand errors are isolated and recorded
 * on `voispeed_configs.last_ivr_sync_error`.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { timingSafeEqualAny } from "../_shared/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

type IvrNodeRaw = {
  voispeed_ivr_id: string;
  name: string;
  parent_voispeed_id?: string | null;
  routes_to_queue?: string | null;
  routes_to_ext?: string | null;
};

function extractXmlBlocks(xml: string, tag: string): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const attrRe = /<([a-zA-Z0-9_:-]+)\b[^>]*>([\s\S]*?)<\/\1>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const body = m[1] ?? "";
    const rec: Record<string, string> = {};
    let am: RegExpExecArray | null;
    while ((am = attrRe.exec(body)) !== null) {
      rec[am[1].toLowerCase()] = am[2].trim();
    }
    out.push(rec);
  }
  return out;
}

function parseIvr(text: string, contentType: string): IvrNodeRaw[] {
  try {
    if (contentType.includes("json") || text.trim().startsWith("{") || text.trim().startsWith("[")) {
      const j = JSON.parse(text);
      const arr: any[] = Array.isArray(j) ? j : (j.nodes ?? j.ivr ?? j.items ?? j.data ?? []);
      return arr
        .map((n: any) => ({
          voispeed_ivr_id: String(n.id ?? n.ivr_id ?? n.node_id ?? "").trim(),
          name: String(n.name ?? n.label ?? n.id ?? "").trim() || "(unnamed)",
          parent_voispeed_id: n.parent_id ?? n.parent ?? null,
          routes_to_queue: n.routes_to_queue ?? n.queue ?? n.queue_name ?? null,
          routes_to_ext: n.routes_to_ext ?? n.extension ?? n.ext ?? null,
        }))
        .filter((r) => r.voispeed_ivr_id);
    }
  } catch {
    /* fall through to XML */
  }
  const blocks = extractXmlBlocks(text, "node").concat(extractXmlBlocks(text, "ivr"));
  return blocks
    .map((b) => ({
      voispeed_ivr_id: (b.id ?? b.ivr_id ?? b.node_id ?? "").trim(),
      name: (b.name ?? b.label ?? b.id ?? "").trim() || "(unnamed)",
      parent_voispeed_id: b.parent_id ?? b.parent ?? null,
      routes_to_queue: b.routes_to_queue ?? b.queue ?? b.queue_name ?? null,
      routes_to_ext: b.routes_to_ext ?? b.extension ?? b.ext ?? null,
    }))
    .filter((r) => r.voispeed_ivr_id);
}

async function fetchSeri(baseUrl: string, token: string, service: string) {
  const u = new URL(baseUrl);
  u.searchParams.set("service", service);
  u.searchParams.set("token", token);
  const r = await fetch(u.toString(), { method: "GET" });
  const ct = r.headers.get("content-type") ?? "";
  const text = await r.text();
  if (!r.ok) throw new Error(`SERI ${service} HTTP ${r.status}: ${text.slice(0, 200)}`);
  return { text, ct };
}

async function syncBrand(
  supabase: ReturnType<typeof createClient>,
  cfg: { brand_id: string; base_url: string; token: string; poll_ivr_service: string },
): Promise<{ upserted: number; error?: string }> {
  try {
    const { text, ct } = await fetchSeri(cfg.base_url, cfg.token, cfg.poll_ivr_service);
    const nodes = parseIvr(text, ct);

    // Two-pass: (1) upsert without parent, (2) resolve parent via voispeed_ivr_id map.
    let upserted = 0;
    for (const n of nodes) {
      const { error } = await supabase
        .from("voispeed_ivr_nodes")
        .upsert(
          {
            brand_id: cfg.brand_id,
            voispeed_ivr_id: n.voispeed_ivr_id,
            name: n.name,
            routes_to_queue: n.routes_to_queue,
            routes_to_ext: n.routes_to_ext,
            synced_at: new Date().toISOString(),
          },
          { onConflict: "brand_id,voispeed_ivr_id" },
        );
      if (!error) upserted++;
    }

    // Pass 2 — wire up parent_id once all rows exist
    const { data: idMap } = await supabase
      .from("voispeed_ivr_nodes")
      .select("id, voispeed_ivr_id")
      .eq("brand_id", cfg.brand_id);
    const lookup = new Map<string, string>(
      ((idMap as any[]) ?? []).map((r) => [String(r.voispeed_ivr_id), String(r.id)]),
    );

    for (const n of nodes) {
      if (!n.parent_voispeed_id) continue;
      const parentInternalId = lookup.get(String(n.parent_voispeed_id));
      if (!parentInternalId) continue;
      await supabase
        .from("voispeed_ivr_nodes")
        .update({ parent_id: parentInternalId })
        .eq("brand_id", cfg.brand_id)
        .eq("voispeed_ivr_id", n.voispeed_ivr_id);
    }

    await supabase
      .from("voispeed_configs")
      .update({ last_ivr_sync_at: new Date().toISOString(), last_ivr_sync_error: null })
      .eq("brand_id", cfg.brand_id);

    return { upserted };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase
      .from("voispeed_configs")
      .update({ last_ivr_sync_at: new Date().toISOString(), last_ivr_sync_error: msg.slice(0, 500) })
      .eq("brand_id", cfg.brand_id);
    return { upserted: 0, error: msg };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const cronSecret = req.headers.get("x-cron-secret");
    const expected = Deno.env.get("CRON_SECRET");
    const expectedPrev = Deno.env.get("CRON_SECRET_PREVIOUS");
    if (!cronSecret || !timingSafeEqualAny(cronSecret, expected, expectedPrev)) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: configs, error: cfgErr } = await supabase
      .from("voispeed_configs")
      .select("brand_id, base_url, token, poll_ivr_service")
      .eq("enabled", true);

    if (cfgErr) {
      return new Response(JSON.stringify({ error: "config_query_failed", details: cfgErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const summary: Array<{ brand_id: string; upserted: number; error?: string }> = [];
    for (const cfg of configs ?? []) {
      const res = await syncBrand(supabase, cfg as any);
      summary.push({ brand_id: (cfg as any).brand_id, ...res });
    }

    return new Response(
      JSON.stringify({ ok: true, brands_synced: summary.length, summary }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[voispeed-ivr-sync] fatal", msg);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
