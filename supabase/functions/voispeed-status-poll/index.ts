/**
 * VoiSpeed Status Poller (WS-B / F6)
 *
 * Cron-driven adapter that polls VoiSpeed SERI for live agent state and queue
 * stats per brand and writes them into:
 *   - public.voispeed_agent_status (upsert per brand+ext, bumps `since` on state change)
 *   - public.voispeed_queue_stats   (append-only snapshot)
 *
 * Auth: x-cron-secret (with rotation) OR service-role JWT (internal callers).
 *
 * Per-brand opt-in: `voispeed_configs.enable_realtime_poll = true`.
 *
 * Response parsing is best-effort and tolerant of both JSON and XML responses
 * from SERI. Unknown shapes are skipped (logged) — the function does NOT throw
 * on a single brand failure, it isolates per-brand errors.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { timingSafeEqualAny } from "../_shared/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

type AgentRow = {
  voispeed_ext: string;
  status: string; // already normalized
  queue_name?: string | null;
};
type QueueRow = {
  queue_name: string;
  calls_waiting: number;
  longest_wait_seconds: number;
  agents_available: number;
  agents_busy: number;
  service_level_pct?: number | null;
  abandoned_15m?: number | null;
};

const ALLOWED_STATUSES = new Set([
  "available",
  "on_call",
  "paused",
  "wrap_up",
  "offline",
  "ringing",
  "dnd",
]);

/** Maps common VoiSpeed status strings to our enum */
function normalizeStatus(raw: unknown): string {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return "offline";
  if (ALLOWED_STATUSES.has(s)) return s;
  // Common SERI synonyms
  if (["idle", "free", "ready", "online"].includes(s)) return "available";
  if (["busy", "talking", "incall", "in_call", "answered"].includes(s)) return "on_call";
  if (["pause", "break", "lunch", "acw"].includes(s)) return "paused";
  if (["wrap", "wrapping", "afterwork"].includes(s)) return "wrap_up";
  if (["ring", "alerting"].includes(s)) return "ringing";
  if (["donotdisturb", "do_not_disturb"].includes(s)) return "dnd";
  return "offline";
}

function toInt(v: unknown, def = 0): number {
  const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : def;
}
function toFloat(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

/** Very lightweight XML→records extractor. Looks for repeating tag blocks. */
function extractXmlBlocks(xml: string, tag: string): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const attrRe = /<([a-zA-Z0-9_:-]+)\b[^>]*>([\\s\\S]*?)<\/\1>/g;
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

function parseAgents(text: string, contentType: string): AgentRow[] {
  try {
    if (contentType.includes("json") || text.trim().startsWith("{") || text.trim().startsWith("[")) {
      const j = JSON.parse(text);
      const arr: any[] = Array.isArray(j) ? j : (j.agents ?? j.data ?? j.items ?? []);
      return arr
        .map((a: any) => ({
          voispeed_ext: String(a.ext ?? a.extension ?? a.id ?? "").trim(),
          status: normalizeStatus(a.status ?? a.state),
          queue_name: a.queue ?? a.queue_name ?? null,
        }))
        .filter((r) => r.voispeed_ext);
    }
  } catch {
    /* fall through to XML */
  }
  // XML fallback: <agent><ext>101</ext><status>busy</status></agent>
  const blocks = extractXmlBlocks(text, "agent");
  return blocks
    .map((b) => ({
      voispeed_ext: (b.ext ?? b.extension ?? b.id ?? "").trim(),
      status: normalizeStatus(b.status ?? b.state),
      queue_name: b.queue ?? b.queue_name ?? null,
    }))
    .filter((r) => r.voispeed_ext);
}

function parseQueues(text: string, contentType: string): QueueRow[] {
  try {
    if (contentType.includes("json") || text.trim().startsWith("{") || text.trim().startsWith("[")) {
      const j = JSON.parse(text);
      const arr: any[] = Array.isArray(j) ? j : (j.queues ?? j.data ?? j.items ?? []);
      return arr
        .map((q: any) => ({
          queue_name: String(q.name ?? q.queue ?? q.id ?? "").trim(),
          calls_waiting: toInt(q.calls_waiting ?? q.waiting),
          longest_wait_seconds: toInt(q.longest_wait ?? q.longest_wait_seconds),
          agents_available: toInt(q.agents_available ?? q.available),
          agents_busy: toInt(q.agents_busy ?? q.busy),
          service_level_pct: toFloat(q.service_level_pct ?? q.sl),
          abandoned_15m: toInt(q.abandoned_15m ?? q.abandoned, 0),
        }))
        .filter((r) => r.queue_name);
    }
  } catch {
    /* fall through */
  }
  const blocks = extractXmlBlocks(text, "queue");
  return blocks
    .map((b) => ({
      queue_name: (b.name ?? b.queue ?? b.id ?? "").trim(),
      calls_waiting: toInt(b.calls_waiting ?? b.waiting),
      longest_wait_seconds: toInt(b.longest_wait ?? b.longest_wait_seconds),
      agents_available: toInt(b.agents_available ?? b.available),
      agents_busy: toInt(b.agents_busy ?? b.busy),
      service_level_pct: toFloat(b.service_level_pct ?? b.sl),
      abandoned_15m: toInt(b.abandoned_15m ?? b.abandoned, 0),
    }))
    .filter((r) => r.queue_name);
}

async function fetchSeri(baseUrl: string, token: string, service: string): Promise<{ text: string; ct: string }> {
  const u = new URL(baseUrl);
  u.searchParams.set("service", service);
  u.searchParams.set("token", token);
  const r = await fetch(u.toString(), { method: "GET" });
  const ct = r.headers.get("content-type") ?? "";
  const text = await r.text();
  if (!r.ok) throw new Error(`SERI ${service} HTTP ${r.status}: ${text.slice(0, 200)}`);
  return { text, ct };
}

async function pollBrand(
  supabase: ReturnType<typeof createClient>,
  cfg: {
    brand_id: string;
    base_url: string;
    token: string;
    poll_agents_service: string;
    poll_queues_service: string;
  },
): Promise<{ agents: number; queues: number; error?: string }> {
  let agentsCount = 0;
  let queuesCount = 0;
  try {
    // ---- AGENTS ----
    const a = await fetchSeri(cfg.base_url, cfg.token, cfg.poll_agents_service);
    const agents = parseAgents(a.text, a.ct);
    for (const ag of agents) {
      // Fetch existing row to decide whether to bump `since`
      const { data: existing } = await supabase
        .from("voispeed_agent_status")
        .select("status")
        .eq("brand_id", cfg.brand_id)
        .eq("voispeed_ext", ag.voispeed_ext)
        .maybeSingle();

      const stateChanged = !existing || (existing as any).status !== ag.status;
      const payload: Record<string, unknown> = {
        brand_id: cfg.brand_id,
        voispeed_ext: ag.voispeed_ext,
        status: ag.status,
        queue_name: ag.queue_name ?? null,
        updated_at: new Date().toISOString(),
      };
      if (stateChanged) payload.since = new Date().toISOString();

      const { error: upErr } = await supabase
        .from("voispeed_agent_status")
        .upsert(payload, { onConflict: "brand_id,voispeed_ext" });
      if (!upErr) agentsCount++;
    }

    // ---- QUEUES ----
    const q = await fetchSeri(cfg.base_url, cfg.token, cfg.poll_queues_service);
    const queues = parseQueues(q.text, q.ct);
    if (queues.length > 0) {
      const rows = queues.map((qq) => ({
        brand_id: cfg.brand_id,
        queue_name: qq.queue_name,
        calls_waiting: qq.calls_waiting,
        longest_wait_seconds: qq.longest_wait_seconds,
        agents_available: qq.agents_available,
        agents_busy: qq.agents_busy,
        service_level_pct: qq.service_level_pct,
        abandoned_15m: qq.abandoned_15m,
      }));
      const { error: insErr } = await supabase.from("voispeed_queue_stats").insert(rows);
      if (!insErr) queuesCount = rows.length;
    }

    // Mark success
    await supabase
      .from("voispeed_configs")
      .update({ last_poll_at: new Date().toISOString(), last_poll_error: null })
      .eq("brand_id", cfg.brand_id);

    return { agents: agentsCount, queues: queuesCount };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase
      .from("voispeed_configs")
      .update({ last_poll_at: new Date().toISOString(), last_poll_error: msg.slice(0, 500) })
      .eq("brand_id", cfg.brand_id);
    return { agents: agentsCount, queues: queuesCount, error: msg };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // ---- Auth: x-cron-secret (rotation) ----
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
      .select("brand_id, base_url, token, poll_agents_service, poll_queues_service")
      .eq("enabled", true)
      .eq("enable_realtime_poll", true);

    if (cfgErr) {
      return new Response(JSON.stringify({ error: "config_query_failed", details: cfgErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const summary: Array<{ brand_id: string; agents: number; queues: number; error?: string }> = [];
    for (const cfg of configs ?? []) {
      const res = await pollBrand(supabase, cfg as any);
      summary.push({ brand_id: (cfg as any).brand_id, ...res });
    }

    return new Response(
      JSON.stringify({ ok: true, brands_polled: summary.length, summary }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[voispeed-status-poll] fatal", msg);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
