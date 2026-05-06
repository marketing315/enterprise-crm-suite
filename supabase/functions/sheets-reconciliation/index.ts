// sheets-reconciliation
// ─────────────────────────────────────────────────────────────────────────────
// Daily cron (03:00). Reconciles lead_events ↔ sheets_export_logs for the
// last 7 days. If lead_events have no corresponding successful export row,
// auto-enqueues a backfill via enqueue_missing_sheets_exports() RPC.
//
// We compare against sheets_export_logs (the queue) rather than reading
// the actual Google Sheet because the Sheet API requires per-tenant OAuth
// and the queue is the source of truth for "did we attempt to export?".
// If the queue says success → the row exists in the Sheet.
//
// Auth: x-cron-secret OR Bearer service_role JWT.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "npm:@supabase/supabase-js@2";
import { timingSafeEqual, timingSafeEqualAny } from "../_shared/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_BRAND_ID = "00000000-0000-0000-0000-000000000000";
const WINDOW_DAYS = 7;
const DRIFT_PCT_WARN = 2;
const DRIFT_PCT_CRITICAL = 10;
const MAX_BACKFILL = 1000;

function authOk(req: Request): boolean {
  const cronSecret = Deno.env.get("CRON_SECRET");
  const cronSecretPrev = Deno.env.get("CRON_SECRET_PREVIOUS");
  const provided = req.headers.get("x-cron-secret");
  if (cronSecret && provided && timingSafeEqualAny(provided, cronSecret, cronSecretPrev)) return true;
  const auth = req.headers.get("authorization") || "";
  if (auth.startsWith("Bearer ")) {
    const token = auth.replace("Bearer ", "");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (serviceKey && timingSafeEqual(token, serviceKey)) return true;
  }
  return false;
}

Deno.serve(async (req) => {
  const correlationId = crypto.randomUUID();
  const log = (level: "log" | "error", msg: string, extra?: Record<string, unknown>) =>
    console[level](JSON.stringify({
      ts: new Date().toISOString(),
      correlation_id: correlationId,
      fn: "sheets-reconciliation",
      level,
      msg,
      ...extra,
    }));

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (!authOk(req)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const periodEnd = new Date();
    const periodStart = new Date(periodEnd.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const { count: dbCount, error: leadErr } = await supabase
      .from("lead_events")
      .select("id", { count: "exact", head: true })
      .gte("created_at", periodStart.toISOString())
      .lte("created_at", periodEnd.toISOString())
      .or("archived.is.null,archived.eq.false");
    if (leadErr) throw leadErr;

    const { count: sheetCount, error: succErr } = await supabase
      .from("sheets_export_logs")
      .select("id", { count: "exact", head: true })
      .eq("status", "success")
      .gte("created_at", periodStart.toISOString())
      .lte("created_at", periodEnd.toISOString());
    if (succErr) throw succErr;

    const db = dbCount ?? 0;
    const sheet = sheetCount ?? 0;
    const delta = db - sheet;
    const deltaPct = db === 0 ? 0 : Math.round((Math.abs(delta) / db) * 10000) / 100;

    let status: "ok" | "drift" | "critical" | "error" = "ok";
    if (deltaPct >= DRIFT_PCT_CRITICAL) status = "critical";
    else if (deltaPct >= DRIFT_PCT_WARN) status = "drift";

    let backfillEnqueued = 0;
    if (delta > 0 && status !== "ok") {
      const { data: bf, error: bfErr } = await supabase.rpc("enqueue_missing_sheets_exports", {
        p_since: periodStart.toISOString(),
        p_until: periodEnd.toISOString(),
        p_limit: MAX_BACKFILL,
      });
      if (bfErr) log("error", "backfill rpc failed", { err: bfErr.message });
      else backfillEnqueued = Number(bf ?? 0);
    }

    await supabase.from("sheets_reconciliation_log").insert({
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
      db_count: db,
      sheet_count: sheet,
      delta,
      delta_pct: deltaPct,
      status,
      backfill_enqueued: backfillEnqueued,
      details: { window_days: WINDOW_DAYS, correlation_id: correlationId },
    });

    log("log", "reconciliation done", { db, sheet, delta, deltaPct, status, backfillEnqueued });

    if (status === "critical") {
      const { data: adminRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["admin", "ceo"])
        .eq("is_active", true);
      const adminUserIds = Array.from(new Set((adminRoles ?? []).map((r) => r.user_id).filter(Boolean)));
      if (adminUserIds.length > 0) {
        const title = "🚨 Drift Sheet Export elevato";
        const body = `Ultimi ${WINDOW_DAYS} giorni: ${db} lead in DB vs ${sheet} export riusciti (delta ${deltaPct}%). Backfill auto: ${backfillEnqueued}.`;
        await supabase.from("notifications").insert(
          adminUserIds.map((uid) => ({
            brand_id: SYSTEM_BRAND_ID,
            user_id: uid,
            type: "slo_alert" as const,
            title,
            body,
            entity_type: "sheets_reconciliation",
          })),
        );
      }
    }

    return new Response(
      JSON.stringify({ ok: true, db, sheet, delta, delta_pct: deltaPct, status, backfill_enqueued: backfillEnqueued }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("error", "reconciliation failed", { err: msg });
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
