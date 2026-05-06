// cron-health-monitor
// ─────────────────────────────────────────────────────────────────────────────
// Periodic infrastructure health check that detects and emails:
//  1. Legacy/duplicate cron jobs reappeared (same jobname registered >1 times)
//  2. High error rate in cron-relay calls (errors > threshold over last window)
//
// Sends an URGENT email (template: cron-health-alert) to the configured
// recipient with runbook + context. Cooldown via health_alert_state to avoid
// flood (1h per alert key).
//
// Auth: x-cron-secret OR Bearer service_role.
// Schedule: every 5 minutes via cron-relay.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "npm:@supabase/supabase-js@2";
import { timingSafeEqual, timingSafeEqualAny } from "../_shared/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const ALERT_RECIPIENT = "marketing@gruppobenessere.it";
const DASHBOARD_URL = "https://ralph-hub.lovable.app/admin/cron-jobs";

// Tunables
const ERROR_RATE_WINDOW_MIN = 15;             // last 15 minutes
const MIN_SAMPLES_FOR_RATE = 20;              // ignore tiny windows
const ERROR_RATE_THRESHOLD = 30;              // %
const COOLDOWN_MINUTES = 60;                  // do not re-send same alert within 1h
const JWT_AUTH_MIN_COUNT = 3;                 // min 401/403 in window to fire JWT alert
const JWT_AUTH_WINDOW_MIN = 15;               // window for JWT auth failures

// Names of jobs that were intentionally removed and MUST stay removed
// (legacy jobs that bypass cron-relay → cause 401 flood).
const LEGACY_FORBIDDEN_JOBNAMES = new Set<string>([
  "sla-breach-checker",
  "slo-burn-rate-monitor",
  "ticket-escalation-every-5min",
  "ticket-assign-recovery",
]);

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

interface SendArgs {
  alertKey: string;
  templateData: Record<string, unknown>;
  // identifying payload subset used to detect "same alert" between runs
  identitySnapshot: Record<string, unknown>;
}

async function maybeSendAlert(
  supabase: ReturnType<typeof createClient>,
  args: SendArgs,
  log: (lvl: "log" | "error", msg: string, extra?: Record<string, unknown>) => void,
): Promise<{ sent: boolean; reason?: string }> {
  // Cooldown check
  const { data: existing } = await supabase
    .from("health_alert_state")
    .select("alert_key, last_sent_at, last_payload, send_count")
    .eq("alert_key", args.alertKey)
    .maybeSingle();

  const now = Date.now();
  if (existing) {
    const last = new Date(existing.last_sent_at as string).getTime();
    const ageMin = (now - last) / 60_000;
    if (ageMin < COOLDOWN_MINUTES) {
      return { sent: false, reason: `cooldown ${ageMin.toFixed(1)}m < ${COOLDOWN_MINUTES}m` };
    }
  }

  // Send transactional email
  const { error: invokeErr } = await supabase.functions.invoke("send-transactional-email", {
    body: {
      templateName: "cron-health-alert",
      recipientEmail: ALERT_RECIPIENT,
      idempotencyKey: `health-alert-${args.alertKey}-${Math.floor(now / (COOLDOWN_MINUTES * 60_000))}`,
      templateData: args.templateData,
    },
  });
  if (invokeErr) {
    log("error", "send-transactional-email failed", { err: invokeErr.message, alertKey: args.alertKey });
    return { sent: false, reason: "send_failed" };
  }

  // Update state
  await supabase.from("health_alert_state").upsert({
    alert_key: args.alertKey,
    last_sent_at: new Date(now).toISOString(),
    last_payload: args.identitySnapshot,
    send_count: (existing?.send_count ?? 0) + 1,
    updated_at: new Date(now).toISOString(),
  }, { onConflict: "alert_key" });

  log("log", "alert sent", { alertKey: args.alertKey, recipient: ALERT_RECIPIENT });
  return { sent: true };
}

Deno.serve(async (req) => {
  const correlationId = crypto.randomUUID();
  const log = (level: "log" | "error", msg: string, extra?: Record<string, unknown>) =>
    console[level](JSON.stringify({
      ts: new Date().toISOString(), correlation_id: correlationId, fn: "cron-health-monitor", level, msg, ...extra,
    }));

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (!authOk(req)) {
    log("error", "unauthorized");
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const sentAlerts: string[] = [];
    const skipped: Array<{ key: string; reason: string }> = [];

    // ────────────────────────────────────────────────────────────────────────
    // CHECK 1: Legacy cron jobs reappeared
    // We use list_cron_jobs() (admin-restricted via has_role). With service_role
    // the RPC bypasses RLS but its internal guard requires admin via auth.uid().
    // Instead, we read the legacy jobnames via cron_relay_log absence + look at
    // pg_cron via RPC `cron_duplicate_jobs` (admin only — same problem).
    //
    // Solution: dedicated security-definer RPC `list_legacy_cron_jobnames`
    // that is callable by service_role without role checks — see migration.
    // For now, we approximate by checking duplicates via cron_run_log:
    // if a forbidden jobname appears in the log within last hour AND its run
    // is NOT also tracked in cron_relay_log, the legacy version is back.
    // ────────────────────────────────────────────────────────────────────────
    const sinceLegacy = new Date(Date.now() - 60 * 60_000).toISOString();
    const { data: relayedRecent } = await supabase
      .from("cron_relay_log")
      .select("job_name")
      .gte("created_at", sinceLegacy);
    const relayedJobs = new Set((relayedRecent ?? []).map((r: any) => r.job_name as string));

    const reappeared: string[] = [];
    for (const jn of LEGACY_FORBIDDEN_JOBNAMES) {
      // If the job ran recently but NOT via cron-relay, the legacy direct cron is back.
      const { count } = await supabase
        .from("cron_run_log")
        .select("id", { count: "exact", head: true })
        .eq("job_name", jn)
        .gte("started_at", sinceLegacy);
      // Also consider direct evidence: the *-5min variant is the relay version.
      const relayVariant = `${jn}-5min`;
      const ranViaRelay = relayedJobs.has(jn) || relayedJobs.has(relayVariant);
      if ((count ?? 0) > 0 && !ranViaRelay) {
        reappeared.push(jn);
      }
    }

    if (reappeared.length > 0) {
      const result = await maybeSendAlert(supabase, {
        alertKey: `legacy_cron_reappeared:${reappeared.sort().join(",")}`,
        identitySnapshot: { jobs: reappeared },
        templateData: {
          alertType: "legacy_cron_reappeared",
          severity: "critical",
          title: `Cron legacy ricomparsi (${reappeared.length})`,
          summary: `Job legacy che dovrebbero passare per cron-relay sono tornati a girare direttamente. Causano flood 401/403 sui log auth.`,
          affectedJobs: reappeared,
          metricsWindow: "ultima ora",
          occurredAt: new Date().toISOString(),
          dashboardUrl: DASHBOARD_URL,
          runbook: [
            `Aprire ${DASHBOARD_URL} → tab "Duplicati" per vedere i jobid`,
            "In SQL: SELECT cron.unschedule(<jobid>) per ogni duplicato legacy",
            "Verificare che resti attiva SOLO la variante *-5min (via cron-relay)",
            "Se manca, ri-creare con cron.schedule via cron-relay (target whitelisted)",
            "Controllare cessazione errori 401 su /auth/v1/user nei prossimi 5 minuti",
          ],
        },
      }, log);
      result.sent ? sentAlerts.push(`legacy:${reappeared.length}`) : skipped.push({ key: "legacy", reason: result.reason ?? "?" });
    }

    // ────────────────────────────────────────────────────────────────────────
    // CHECK 2: High error rate on cron-relay (proxy for 401/403 flood + 5xx)
    // Errors = upstream_status NULL or 0 or >= 400
    // ────────────────────────────────────────────────────────────────────────
    const sinceRate = new Date(Date.now() - ERROR_RATE_WINDOW_MIN * 60_000).toISOString();
    const { data: relayRows } = await supabase
      .from("cron_relay_log")
      .select("job_name, upstream_status")
      .gte("created_at", sinceRate)
      .limit(5000);

    const stats = new Map<string, { total: number; errors: number; statuses: Map<number, number> }>();
    let totalAll = 0, errorsAll = 0;
    for (const r of relayRows ?? []) {
      const job = (r as any).job_name as string;
      const st = (r as any).upstream_status as number | null;
      const isErr = st == null || st === 0 || st >= 400;
      const cur = stats.get(job) ?? { total: 0, errors: 0, statuses: new Map() };
      cur.total += 1;
      if (isErr) cur.errors += 1;
      const k = st ?? 0;
      cur.statuses.set(k, (cur.statuses.get(k) ?? 0) + 1);
      stats.set(job, cur);
      totalAll += 1;
      if (isErr) errorsAll += 1;
    }

    const overallRate = totalAll > 0 ? (errorsAll / totalAll) * 100 : 0;
    const offendingJobs = Array.from(stats.entries())
      .filter(([, s]) => s.total >= MIN_SAMPLES_FOR_RATE && (s.errors / s.total) * 100 >= ERROR_RATE_THRESHOLD)
      .sort((a, b) => (b[1].errors / b[1].total) - (a[1].errors / a[1].total));

    if (totalAll >= MIN_SAMPLES_FOR_RATE && (overallRate >= ERROR_RATE_THRESHOLD || offendingJobs.length > 0)) {
      const topJobsList = offendingJobs.slice(0, 10).map(([j, s]) => {
        const topStatus = Array.from(s.statuses.entries()).sort((a, b) => b[1] - a[1])[0];
        return `${j} — ${s.errors}/${s.total} (${((s.errors / s.total) * 100).toFixed(0)}%, top status: ${topStatus?.[0] ?? "?"})`;
      });

      const result = await maybeSendAlert(supabase, {
        alertKey: `high_error_rate:${offendingJobs.map(([j]) => j).sort().join(",") || "overall"}`,
        identitySnapshot: { offendingJobs: offendingJobs.map(([j]) => j), overallRate },
        templateData: {
          alertType: "high_error_rate",
          severity: overallRate >= 60 ? "critical" : "warning",
          title: `Tasso errori cron sopra soglia (${overallRate.toFixed(1)}%)`,
          summary: `Negli ultimi ${ERROR_RATE_WINDOW_MIN} minuti il ${overallRate.toFixed(1)}% delle invocazioni cron-relay è fallito (${errorsAll}/${totalAll}). Soglia ${ERROR_RATE_THRESHOLD}%.`,
          affectedJobs: topJobsList,
          metricsWindow: `ultimi ${ERROR_RATE_WINDOW_MIN} minuti`,
          errorRate: overallRate,
          threshold: ERROR_RATE_THRESHOLD,
          occurredAt: new Date().toISOString(),
          dashboardUrl: DASHBOARD_URL,
          runbook: [
            `Aprire ${DASHBOARD_URL} → tab "Errori & metriche" e filtrare per il job sospetto`,
            "Identificare lo status code dominante: 401/403 = auth, 5xx = upstream down, 0 = timeout/network",
            "Per 401/403: verificare CRON_SECRET in vault e che le edge function pubbliche abbiano middleware aggiornato",
            "Per 5xx: aprire i log dell'edge function target — possibili crash o quota AI esaurita",
            "Per 0/timeout: controllare durate medie in cron_relay_log e capacità edge runtime",
            "Se persistente >30 min: disabilitare il cron incriminato con cron.unschedule(<jobid>) e aprire ticket",
          ],
        },
      }, log);
      result.sent ? sentAlerts.push(`error_rate:${overallRate.toFixed(0)}`) : skipped.push({ key: "error_rate", reason: result.reason ?? "?" });
    }

    // ────────────────────────────────────────────────────────────────────────
    // CHECK 3: JWT / auth failures on cron-relay (status 401/403)
    // Breakdown per job × brand. Fires as soon as JWT_AUTH_MIN_COUNT occur.
    // ────────────────────────────────────────────────────────────────────────
    const sinceJwt = new Date(Date.now() - JWT_AUTH_WINDOW_MIN * 60_000).toISOString();
    const { data: authRows } = await supabase
      .from("cron_relay_log")
      .select("job_name, brand_id, upstream_status, error, created_at")
      .gte("created_at", sinceJwt)
      .in("upstream_status", [401, 403])
      .limit(2000);

    const authFailures = authRows ?? [];
    if (authFailures.length >= JWT_AUTH_MIN_COUNT) {
      const breakdown = new Map<string, { count: number; statuses: Set<number>; lastError: string | null; lastAt: string }>();
      for (const r of authFailures) {
        const job = (r as any).job_name as string;
        const brand = ((r as any).brand_id as string | null) ?? "system";
        const key = `${job}|${brand}`;
        const cur = breakdown.get(key) ?? { count: 0, statuses: new Set<number>(), lastError: null, lastAt: "" };
        cur.count += 1;
        cur.statuses.add((r as any).upstream_status as number);
        const ts = (r as any).created_at as string;
        if (!cur.lastAt || ts > cur.lastAt) {
          cur.lastAt = ts;
          cur.lastError = ((r as any).error as string | null) ?? null;
        }
        breakdown.set(key, cur);
      }
      const top = Array.from(breakdown.entries())
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 10)
        .map(([k, v]) => {
          const [job, brand] = k.split("|");
          const sts = Array.from(v.statuses).sort().join("/");
          const errSnippet = v.lastError ? ` — ${v.lastError.slice(0, 80)}` : "";
          return `${job} (brand=${brand}): ${v.count} fail [${sts}]${errSnippet}`;
        });

      const result = await maybeSendAlert(supabase, {
        alertKey: `jwt_auth_failures:${Array.from(breakdown.keys()).sort().join(",")}`,
        identitySnapshot: { failures: authFailures.length, jobs: Array.from(breakdown.keys()) },
        templateData: {
          alertType: "jwt_auth_failures",
          severity: authFailures.length >= 20 ? "critical" : "warning",
          title: `Cron auth failures (${authFailures.length} × 401/403)`,
          summary: `Negli ultimi ${JWT_AUTH_WINDOW_MIN} min cron-relay ha registrato ${authFailures.length} chiamate respinte con 401/403 su ${breakdown.size} combinazioni job × brand. Probabile JWT errato o CRON_SECRET non sincronizzato.`,
          affectedJobs: top,
          metricsWindow: `ultimi ${JWT_AUTH_WINDOW_MIN} minuti`,
          occurredAt: new Date().toISOString(),
          dashboardUrl: DASHBOARD_URL,
          runbook: [
            `Aprire ${DASHBOARD_URL} → tab "Relay status" e filtrare per i job in lista`,
            "401: CRON_SECRET non corrispondente o middleware edge function non aggiornato",
            "403: identità autenticata ma senza ruolo richiesto (admin/CEO o brand_id mismatch)",
            "Verificare in vault che CRON_SECRET (e CRON_SECRET_PREVIOUS durante rotation) siano allineati",
            "Se rotation in corso: completare il deploy di tutte le edge function target",
            "Per fail concentrati su un brand: controllare brand_membership e RLS",
          ],
        },
      }, log);
      result.sent ? sentAlerts.push(`jwt:${authFailures.length}`) : skipped.push({ key: "jwt_auth", reason: result.reason ?? "?" });
    }

    log("log", "health check completed", {
      sent: sentAlerts, skipped, totalAll, errorsAll, overallRate: overallRate.toFixed(2),
    });

    return new Response(JSON.stringify({
      ok: true,
      sent: sentAlerts,
      skipped,
      stats: { totalAll, errorsAll, overallRate, offendingJobsCount: offendingJobs.length, legacyReappeared: reappeared.length, jwtAuthFailures: authFailures.length },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    log("error", "monitor crashed", { err: err instanceof Error ? err.message : String(err) });
    return new Response(JSON.stringify({ error: "internal" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
