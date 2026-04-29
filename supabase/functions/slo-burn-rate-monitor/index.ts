// SLO Burn Rate Monitor
// ─────────────────────────────────────────────────────────────────────────────
// Reads burn rates from public.slo_definitions + calculate_slo_burn_rate(),
// applies Google SRE multi-window burn-rate alerting thresholds, dispatches
// to Slack (SLACK_WEBHOOK_URL secret), and dedupes via mcp_slo_alerts.
//
// Schedule: every 5 min via pg_cron.
// Auth: x-cron-secret OR Bearer service_role JWT (same pattern as sla-breach-checker).
//
// Thresholds (Google SRE workbook):
//   - burn_1h >= 14.4 → SEV1 (page)  — exhausts 30d budget in 2h
//   - burn_6h >= 6.0  → SEV2 (warn)  — exhausts 30d budget in 5h
//   - burn_24h >= 3.0 → SEV3 (info)  — exhausts 30d budget in 10h
//
// Dedup: if an UNACKED alert of same (slo_id, severity) exists within 1h, skip.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

type Severity = "SEV1" | "SEV2" | "SEV3";

interface BurnRateRow {
  current_sli: number | null;
  error_budget_remaining: number | null;
  burn_rate_1h: number | null;
  burn_rate_6h: number | null;
  burn_rate_24h: number | null;
}

const THRESHOLDS: Array<{ severity: Severity; window: "1h" | "6h" | "24h"; min: number; emoji: string }> = [
  { severity: "SEV1", window: "1h", min: 14.4, emoji: "🚨" },
  { severity: "SEV2", window: "6h", min: 6.0, emoji: "⚠️" },
  { severity: "SEV3", window: "24h", min: 3.0, emoji: "ℹ️" },
];

function authOk(req: Request): boolean {
  const cronSecret = Deno.env.get("CRON_SECRET");
  const cronSecretPrev = Deno.env.get("CRON_SECRET_PREVIOUS");
  const provided = req.headers.get("x-cron-secret");
  if (cronSecret && provided && (provided === cronSecret || (cronSecretPrev && provided === cronSecretPrev))) {
    return true;
  }
  const auth = req.headers.get("authorization") || "";
  if (auth.startsWith("Bearer ")) {
    const token = auth.replace("Bearer ", "");
    const cronAnonJwt = Deno.env.get("CRON_ANON_JWT");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (cronAnonJwt && token === cronAnonJwt) return true;
    if (serviceKey && token === serviceKey) return true;
  }
  return false;
}

async function postSlack(webhookUrl: string, text: string, blocks?: unknown[]): Promise<boolean> {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(blocks ? { text, blocks } : { text }),
    });
    await res.text();
    return res.ok;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  const correlationId = crypto.randomUUID();
  const log = (level: "log" | "error", msg: string, extra?: Record<string, unknown>) =>
    console[level](JSON.stringify({ ts: new Date().toISOString(), correlation_id: correlationId, fn: "slo-burn-rate-monitor", level, msg, ...extra }));

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

    const slackUrl = Deno.env.get("SLACK_WEBHOOK_URL");

    // 1. Load active SLOs
    const { data: slos, error: sloErr } = await supabase
      .from("slo_definitions")
      .select("id, name, service_name, metric_type, target_percentage, window_days")
      .eq("is_active", true);

    if (sloErr) throw sloErr;
    if (!slos || slos.length === 0) {
      return new Response(JSON.stringify({ ok: true, checked: 0, alerts: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let alertsFired = 0;
    let alertsSkipped = 0;
    const dispatched: Array<Record<string, unknown>> = [];

    // 2. For each SLO compute burn rate + decide if alert
    for (const slo of slos) {
      const { data: rate, error: rateErr } = await supabase.rpc("calculate_slo_burn_rate", { p_slo_id: slo.id });
      if (rateErr) {
        log("error", "burn rate rpc failed", { slo_id: slo.id, err: rateErr.message });
        continue;
      }
      const r = (Array.isArray(rate) ? rate[0] : rate) as BurnRateRow | null;
      if (!r) continue;

      const burns: Record<"1h" | "6h" | "24h", number | null> = {
        "1h": r.burn_rate_1h,
        "6h": r.burn_rate_6h,
        "24h": r.burn_rate_24h,
      };

      // Pick highest severity that fires (SEV1 > SEV2 > SEV3)
      const fired = THRESHOLDS.find((t) => {
        const v = burns[t.window];
        return typeof v === "number" && v >= t.min;
      });
      if (!fired) continue;

      // Dedup: skip if unacked alert of same (slo_id, severity) within last hour
      const { data: recent } = await supabase
        .from("mcp_slo_alerts")
        .select("id")
        .eq("alert_type", `slo:${slo.name}`)
        .eq("severity", fired.severity)
        .is("acknowledged_at", null)
        .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
        .limit(1);

      if (recent && recent.length > 0) {
        alertsSkipped++;
        continue;
      }

      const burnValue = burns[fired.window]!;

      // 3. Persist alert (audit trail) — graceful if RLS blocks
      const { data: insertedRows, error: insErr } = await supabase
        .from("mcp_slo_alerts")
        .insert({
          alert_type: `slo:${slo.name}`,
          severity: fired.severity,
          window_start: new Date(Date.now() - (fired.window === "1h" ? 1 : fired.window === "6h" ? 6 : 24) * 60 * 60 * 1000).toISOString(),
          window_end: new Date().toISOString(),
          metric_value: burnValue,
          threshold: fired.min,
          details: {
            slo_id: slo.id,
            service_name: slo.service_name,
            metric_type: slo.metric_type,
            target_percentage: slo.target_percentage,
            current_sli: r.current_sli,
            error_budget_remaining: r.error_budget_remaining,
            burn_rate_1h: r.burn_rate_1h,
            burn_rate_6h: r.burn_rate_6h,
            burn_rate_24h: r.burn_rate_24h,
            triggered_window: fired.window,
          },
        })
        .select("id");

      if (insErr) {
        log("error", "alert insert failed", { slo_id: slo.id, err: insErr.message });
        continue;
      }

      // 4. Dispatch to Slack
      let slackDelivered = false;
      if (slackUrl) {
        const text = `${fired.emoji} *${fired.severity}* — SLO \`${slo.name}\` burn rate ${burnValue.toFixed(2)}× over ${fired.window}`;
        const blocks = [
          {
            type: "section",
            text: { type: "mrkdwn", text },
          },
          {
            type: "section",
            fields: [
              { type: "mrkdwn", text: `*Service*\n${slo.service_name}` },
              { type: "mrkdwn", text: `*Target*\n${slo.target_percentage}%` },
              { type: "mrkdwn", text: `*Current SLI*\n${r.current_sli !== null ? Number(r.current_sli).toFixed(2) + "%" : "n/a"}` },
              { type: "mrkdwn", text: `*Budget left*\n${r.error_budget_remaining !== null ? Number(r.error_budget_remaining).toFixed(1) + "%" : "n/a"}` },
              { type: "mrkdwn", text: `*Burn 1h*\n${r.burn_rate_1h?.toFixed(2) ?? "—"}×` },
              { type: "mrkdwn", text: `*Burn 6h*\n${r.burn_rate_6h?.toFixed(2) ?? "—"}×` },
            ],
          },
          {
            type: "context",
            elements: [{ type: "mrkdwn", text: `Triggered window: *${fired.window}* | threshold: ${fired.min}× | corr: \`${correlationId}\`` }],
          },
        ];
        slackDelivered = await postSlack(slackUrl, text, blocks);
      }

      alertsFired++;
      dispatched.push({
        slo: slo.name,
        severity: fired.severity,
        window: fired.window,
        burn_rate: burnValue,
        slack_delivered: slackDelivered,
        alert_id: insertedRows?.[0]?.id,
      });
      log("log", "alert fired", { slo: slo.name, severity: fired.severity, burn: burnValue, slack: slackDelivered });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        checked: slos.length,
        alerts_fired: alertsFired,
        alerts_skipped_dedup: alertsSkipped,
        slack_configured: !!slackUrl,
        dispatched,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("error", "monitor failed", { err: msg });
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
