// Meta Lead Ads — historical backfill per page/form.
// Stream 4: paginates GET /{form_id}/leads on Graph API v21.0 with appsecret_proof,
// inserts stub meta_lead_events (idempotent on (brand_id, leadgen_id)) and chains
// meta-leads-recover via INTERNAL_SERVICE_TOKEN to ingest the new ones.
//
// Auth: brand admin / CEO via Supabase JWT, OR INTERNAL_SERVICE_TOKEN (cron / api).
// Body: {
//   source_id: uuid,            // meta_apps.id
//   form_ids?: string[],        // if omitted → auto-discover via /{page_id}/leadgen_forms
//   since?: ISO,                // default: now - 30d
//   until?: ISO,                // default: now
//   max_pages?: number,         // safety cap per form (default 20, hard cap 50)
//   max_leads?: number,         // safety cap per run (default 1000, hard cap 5000)
//   trigger_kind?: 'manual'|'cron'|'api',
//   dry_run?: boolean,
// }
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  getMetaAppAccessToken,
  resolveMetaPageAccessToken,
} from "../_shared/meta-secrets.ts";

const META_OAUTH_APP_SECRET = Deno.env.get("META_OAUTH_APP_SECRET") ?? "";
import { META_GRAPH_BASE, withProof } from "../_shared/meta-graph.ts";
import { safeJson } from "../_shared/safe-json.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-service-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface BackfillBody {
  source_id?: string;
  form_ids?: string[];
  since?: string;
  until?: string;
  max_pages?: number;
  max_leads?: number;
  trigger_kind?: "manual" | "cron" | "api";
  dry_run?: boolean;
}

interface FormCounter {
  form_id: string;
  name?: string | null;
  pages: number;
  seen: number;
  inserted: number;
  duplicate: number;
  error?: string;
}

function safeMessage(s: string): string {
  return s.replace(/access_token=[^&"\s]+/gi, "access_token=***")
    .replace(/[A-Za-z0-9_\-]{40,}/g, "***");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  // ---- Auth ----
  const authHeader = req.headers.get("Authorization") ?? "";
  const internalToken = Deno.env.get("INTERNAL_SERVICE_TOKEN");
  const isInternal = !!internalToken && (
    req.headers.get("x-internal-service-token") === internalToken ||
    authHeader === `Bearer ${internalToken}`
  );

  let triggeredBy: string | null = null;
  if (!isInternal) {
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const r = await supabase.rpc("get_user_id", { p_user_id: userRes.user.id });
    triggeredBy = (r.data as string | null) ?? null;
    if (!triggeredBy) {
      return new Response(JSON.stringify({ error: "no_internal_user" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  let body: BackfillBody = {};
  try { body = await req.json(); } catch (_) { /* allow empty */ }

  if (!body.source_id) {
    return new Response(JSON.stringify({ error: "missing_source_id" }), {
      status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const maxPages = Math.min(Math.max(body.max_pages ?? 20, 1), 50);
  const maxLeads = Math.min(Math.max(body.max_leads ?? 1000, 1), 5000);
  const since = body.since ? new Date(body.since) : new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const until = body.until ? new Date(body.until) : new Date();
  if (isNaN(since.getTime()) || isNaN(until.getTime()) || since >= until) {
    return new Response(JSON.stringify({ error: "invalid_date_range" }), {
      status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ---- Load meta_app ----
  const { data: app, error: appErr } = await supabase
    .from("meta_apps")
    .select("id, brand_id, page_id, is_active, app_secret")
    .eq("id", body.source_id)
    .single();
  if (appErr || !app) {
    return new Response(JSON.stringify({ error: "app_not_found" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Authz per-brand
  if (!isInternal && triggeredBy) {
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: triggeredBy, _role: "admin", _brand_id: app.brand_id,
    });
    const { data: isCeo } = await supabase.rpc("has_role", {
      _user_id: triggeredBy, _role: "ceo",
    }).catch(() => ({ data: false }));
    if (!isAdmin && !isCeo) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  const storedToken = await getMetaAppAccessToken(supabase, app.id);
  if (!storedToken) {
    return new Response(JSON.stringify({ error: "no_token" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const pageToken = await resolveMetaPageAccessToken(storedToken, app.page_id);
  const appSecret = (app as { app_secret?: string | null }).app_secret || META_OAUTH_APP_SECRET || null;

  // ---- Open run audit row ----
  let runId: string | null = null;
  if (!body.dry_run) {
    const { data: runRow } = await supabase.from("meta_leads_backfill_runs").insert({
      brand_id: app.brand_id,
      source_id: app.id,
      page_id: app.page_id,
      form_id: body.form_ids?.length === 1 ? body.form_ids[0] : null,
      triggered_by: triggeredBy,
      trigger_kind: body.trigger_kind ?? (isInternal ? "cron" : "manual"),
      since_at: since.toISOString(),
      until_at: until.toISOString(),
      status: "running",
    }).select("id").single();
    runId = runRow?.id ?? null;
  }

  // ---- Resolve form list ----
  let formIds = body.form_ids ?? [];
  if (formIds.length === 0) {
    const url = new URL(`${META_GRAPH_BASE}/${app.page_id}/leadgen_forms`);
    url.searchParams.set("fields", "id,name,status");
    url.searchParams.set("limit", "100");
    const final = await withProof(url, pageToken, appSecret);
    const res = await fetch(final);
    const parsed = await safeJson<{ data?: Array<{ id: string; name?: string; status?: string }> }>(res);
    if (!parsed.ok) {
      const msg = `discover_forms: ${parsed.error} status=${parsed.status} body=${safeMessage(parsed.body.slice(0, 400))}`;
      if (runId) await supabase.from("meta_leads_backfill_runs").update({
        status: "failed", error: msg, finished_at: new Date().toISOString(),
      }).eq("id", runId);
      return new Response(JSON.stringify({ error: msg }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    formIds = (parsed.data?.data ?? []).map((f) => f.id);
  }

  // ---- Iterate forms ----
  const sinceUnix = Math.floor(since.getTime() / 1000);
  const untilUnix = Math.floor(until.getTime() / 1000);
  const counters: FormCounter[] = [];
  const newEventIds: string[] = [];
  let totalSeen = 0, totalInserted = 0, totalDuplicate = 0;
  let aborted = false;

  for (const fid of formIds) {
    const c: FormCounter = { form_id: fid, pages: 0, seen: 0, inserted: 0, duplicate: 0 };
    counters.push(c);

    let nextUrl: string | null = (() => {
      const u = new URL(`${META_GRAPH_BASE}/${fid}/leads`);
      u.searchParams.set("fields", "id,created_time,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,platform");
      u.searchParams.set("limit", "100");
      u.searchParams.set("filtering", JSON.stringify([
        { field: "time_created", operator: "GREATER_THAN", value: sinceUnix },
        { field: "time_created", operator: "LESS_THAN", value: untilUnix },
      ]));
      return u.toString();
    })();

    while (nextUrl && c.pages < maxPages && !aborted) {
      const final = await withProof(nextUrl, pageToken, appSecret);
      const res = await fetch(final);
      const parsed = await safeJson<{ data?: Array<{ id: string; created_time?: string; ad_id?: string; campaign_id?: string }>; paging?: { next?: string } }>(res);
      if (!parsed.ok) {
        c.error = `${parsed.error} status=${parsed.status} body=${safeMessage(parsed.body.slice(0, 300))}`;
        break;
      }
      c.pages += 1;
      const list = parsed.data?.data ?? [];
      for (const lead of list) {
        if (totalSeen >= maxLeads) { aborted = true; break; }
        c.seen += 1; totalSeen += 1;

        if (body.dry_run) continue;

        const stub = {
          brand_id: app.brand_id,
          source_id: app.id,
          leadgen_id: lead.id,
          page_id: app.page_id,
          form_id: fid,
          ad_id: lead.ad_id ?? null,
          campaign_id: lead.campaign_id ?? null,
          received_at: lead.created_time ? new Date(lead.created_time).toISOString() : new Date().toISOString(),
          raw_event: { backfill: true, lead_summary: lead, form_id: fid, page_id: app.page_id },
          status: "received" as const,
        };

        // Upsert idempotent on (brand_id, leadgen_id). ignoreDuplicates → returns null if dupe.
        const { data: ins, error: insErr } = await supabase
          .from("meta_lead_events")
          .upsert(stub, { onConflict: "brand_id,leadgen_id", ignoreDuplicates: true })
          .select("id")
          .maybeSingle();
        if (insErr) {
          c.error = `insert: ${insErr.message}`;
          continue;
        }
        if (ins?.id) {
          c.inserted += 1; totalInserted += 1;
          newEventIds.push(ins.id);
        } else {
          c.duplicate += 1; totalDuplicate += 1;
        }
      }
      // The Graph paging URL already embeds access_token; we re-sign it via withProof on next iter.
      nextUrl = parsed.data?.paging?.next ?? null;
    }
  }

  // ---- Chain ingestion via meta-leads-recover (INTERNAL) ----
  let recoveredCount = 0, failedCount = 0;
  if (!body.dry_run && newEventIds.length > 0 && internalToken) {
    // recover processes ≤50 per call; chunk
    for (let i = 0; i < newEventIds.length; i += 50) {
      const chunk = newEventIds.slice(i, i + 50);
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/meta-leads-recover`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${internalToken}`,
            "x-internal-service-token": internalToken,
          },
          body: JSON.stringify({ brand_id: app.brand_id, meta_event_ids: chunk }),
        });
        const json = await res.json().catch(() => null) as { results?: Array<{ status: string }> } | null;
        for (const r of (json?.results ?? [])) {
          if (r.status === "recovered" || r.status === "duplicate_lead_event") recoveredCount += 1;
          else failedCount += 1;
        }
      } catch (e) {
        console.error("[meta-leads-backfill] recover chunk failed", safeMessage(String(e)));
        failedCount += chunk.length;
      }
    }
  }

  const finalStatus = body.dry_run
    ? "completed"
    : (failedCount > 0 ? "partial" : "completed");

  if (runId) {
    await supabase.from("meta_leads_backfill_runs").update({
      pages_fetched: counters.reduce((a, c) => a + c.pages, 0),
      leads_seen: totalSeen,
      leads_inserted: totalInserted,
      leads_duplicate: totalDuplicate,
      leads_recovered: recoveredCount,
      leads_failed: failedCount,
      forms: counters,
      status: finalStatus,
      finished_at: new Date().toISOString(),
    }).eq("id", runId);
  }

  return new Response(JSON.stringify({
    run_id: runId,
    dry_run: !!body.dry_run,
    aborted_max_leads: aborted,
    forms_scanned: formIds.length,
    pages_fetched: counters.reduce((a, c) => a + c.pages, 0),
    leads_seen: totalSeen,
    leads_inserted: totalInserted,
    leads_duplicate: totalDuplicate,
    leads_recovered: recoveredCount,
    leads_failed: failedCount,
    forms: counters,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
