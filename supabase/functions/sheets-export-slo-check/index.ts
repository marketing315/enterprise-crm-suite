// sheets-export-slo-check
// ─────────────────────────────────────────────────────────────────────────────
// Runs every 15 min via cron-relay. Computes drift between lead_events
// arriving in the last hour and successful sheets_export_logs in the same
// window. Persists snapshot in sheets_export_drift_log; if status is
// 'critical' (lead_events > 0 AND 0 successful exports for > 1h) fires an
// in-app notification to all active admins on the System Brand.
//
// This is the alarm that would have caught the April 17 blackout in <1h.
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
const WINDOW_MINUTES = 60;

function authOk(req: Request): boolean {
  const cronSecret = Deno.env.get("CRON_SECRET");
  const cronSecretPrev = Deno.env.get("CRON_SECRET_PREVIOUS");
  const provided = req.headers.get("x-cron-secret");
  if (cronSecret && provided && timingSafeEqualAny(provided, cronSecret, cronSecretPrev)) {
    return true;
  }
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
      fn: "sheets-export-slo-check",
      level,
      msg,
      ...extra,
    }));

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (!authOk(req)) {
    log("error", "unauthorized");
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

    const { data: snap, error: snapErr } = await supabase.rpc("sheets_export_drift_snapshot", {
      p_window_minutes: WINDOW_MINUTES,
    });
    if (snapErr) throw snapErr;

    const row = Array.isArray(snap) ? snap[0] : snap;
    if (!row) throw new Error("snapshot_empty");

    const leads = Number(row.lead_events_count ?? 0);
    const succ = Number(row.exports_success_count ?? 0);
    const pend = Number(row.exports_pending_count ?? 0);
    const fail = Number(row.exports_failed_count ?? 0);
    const ratio = Number(row.success_ratio ?? 100);

    let status: "ok" | "warn" | "critical" = "ok";
    if (leads > 0 && succ === 0) status = "critical";
    else if (leads >= 5 && ratio < 50) status = "critical";
    else if (leads >= 5 && ratio < 80) status = "warn";

    // Dedup: skip if a critical incident was already fired in last hour
    let incidentFired = false;
    if (status === "critical") {
      const { data: recent } = await supabase
        .from("sheets_export_drift_log")
        .select("id")
        .eq("status", "critical")
        .eq("incident_fired", true)
        .gte("checked_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
        .limit(1);

      if (!recent || recent.length === 0) {
        // Notify admins
        const { data: adminRoles } = await supabase
          .from("user_roles")
          .select("user_id")
          .in("role", ["admin", "super_admin"])
          .eq("is_active", true);
        const adminUserIds = Array.from(
          new Set((adminRoles ?? []).map((r) => r.user_id).filter(Boolean)),
        );

        if (adminUserIds.length > 0) {
          const title = "🚨 Google Sheet export bloccato";
          const body = `${leads} lead arrivati nell'ultima ora ma ${succ} export riusciti (pending: ${pend}, falliti: ${fail}). Verifica /admin/sheets-health.`;
          const notifRows = adminUserIds.map((uid) => ({
            brand_id: SYSTEM_BRAND_ID,
            user_id: uid,
            type: "slo_alert" as const,
            title,
            body,
            entity_type: "sheets_export_drift",
          }));
          const { error: notifErr } = await supabase.from("notifications").insert(notifRows);
          if (notifErr) log("error", "notif insert failed", { err: notifErr.message });
          else incidentFired = true;
        }
      }
    }

    const { error: insErr } = await supabase.from("sheets_export_drift_log").insert({
      window_minutes: WINDOW_MINUTES,
      lead_events_count: leads,
      exports_success_count: succ,
      exports_pending_count: pend,
      exports_failed_count: fail,
      success_ratio: ratio,
      status,
      incident_fired: incidentFired,
    });
    if (insErr) log("error", "drift_log insert failed", { err: insErr.message });

    log("log", "drift snapshot", { leads, succ, pend, fail, ratio, status, incidentFired });

    return new Response(
      JSON.stringify({
        ok: true,
        window_minutes: WINDOW_MINUTES,
        leads,
        succ,
        pend,
        fail,
        ratio,
        status,
        incident_fired: incidentFired,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("error", "check failed", { err: msg });
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
