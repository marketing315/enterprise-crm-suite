// F5.5 — Performance Alerts Evaluator
// ─────────────────────────────────────────────────────────────────────────────
// Itera tutti i brand attivi, chiama evaluate_performance_alerts(brand) e
// per ogni evento creato inserisce un alert visibile su /admin/observability
// (mcp_slo_alerts) — stesso pattern di slo-burn-rate-monitor.
//
// Schedule: ogni 30 min via pg_cron.
// Auth: x-cron-secret OR Bearer service_role JWT.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "npm:@supabase/supabase-js@2";
import { timingSafeEqual, timingSafeEqualAny } from "../_shared/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

interface AlertEventRow {
  event_id: string;
  rule_id: string;
  rule_name: string;
  metric: string;
  observed_value: number;
  threshold: number;
  severity: "info" | "warning" | "critical";
}

const SEV_MAP: Record<string, "SEV1" | "SEV2" | "SEV3"> = {
  critical: "SEV1",
  warning: "SEV2",
  info: "SEV3",
};

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
    console[level](
      JSON.stringify({
        ts: new Date().toISOString(),
        correlation_id: correlationId,
        fn: "performance-alerts-evaluator",
        level,
        msg,
        ...extra,
      }),
    );

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

    // Brand candidati: quelli che hanno almeno una regola attiva
    const { data: brands, error: brandsErr } = await supabase
      .from("performance_alert_rules")
      .select("brand_id")
      .eq("is_active", true);

    if (brandsErr) throw brandsErr;

    const uniqueBrands = Array.from(new Set((brands ?? []).map((r) => r.brand_id)));
    log("log", "brands_to_evaluate", { count: uniqueBrands.length });

    let firedTotal = 0;
    let mirroredTotal = 0;
    const perBrand: Array<{ brand_id: string; fired: number }> = [];

    for (const brandId of uniqueBrands) {
      const { data: events, error: evalErr } = await supabase.rpc(
        "evaluate_performance_alerts",
        { p_brand_id: brandId },
      );

      if (evalErr) {
        log("error", "evaluate_failed", { brand_id: brandId, error: evalErr.message });
        continue;
      }

      const rows = (events ?? []) as AlertEventRow[];
      firedTotal += rows.length;
      perBrand.push({ brand_id: brandId, fired: rows.length });

      // Mirror su mcp_slo_alerts per visibilità nella bell + /admin/observability
      for (const ev of rows) {
        const sev = SEV_MAP[ev.severity] ?? "SEV3";
        const windowEnd = new Date();
        const windowStart = new Date(windowEnd.getTime() - 60 * 60 * 1000);

        const { error: insErr } = await supabase.from("mcp_slo_alerts").insert({
          alert_type: `perf:${ev.metric}`,
          severity: sev,
          window_start: windowStart.toISOString(),
          window_end: windowEnd.toISOString(),
          metric_value: ev.observed_value,
          threshold: ev.threshold,
          details: {
            source: "performance-alerts-evaluator",
            brand_id: brandId,
            rule_id: ev.rule_id,
            rule_name: ev.rule_name,
            metric: ev.metric,
            event_id: ev.event_id,
          },
        });

        if (!insErr) mirroredTotal += 1;
      }
    }

    log("log", "done", { fired: firedTotal, mirrored: mirroredTotal });

    return new Response(
      JSON.stringify({
        success: true,
        brands_evaluated: uniqueBrands.length,
        events_fired: firedTotal,
        alerts_mirrored: mirroredTotal,
        per_brand: perBrand,
        correlation_id: correlationId,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log("error", "unhandled", { error: message });
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
