// cron-relay: receives anon-authenticated calls from pg_cron and re-emits them
// to internal hardened edge functions, injecting the `x-cron-secret` header
// from this function's own env. This avoids storing CRON_SECRET in the DB.
//
// Auth model:
// - This function MUST be called by pg_cron with a valid Supabase JWT (anon
//   or service_role). verify_jwt=true (default) so Supabase rejects calls
//   without a valid token before our code runs.
// - We then re-emit to the target function with `x-cron-secret`.
//
// Request body: { "target": "webhook-dispatcher", "payload": {...}, "query": "?from=..." }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { z } from "https://esm.sh/zod@3.23.8";

const RelayBodySchema = z.object({
  target: z.string().min(1).max(80),
  payload: z.unknown().optional(),
  query: z.string().max(2048).optional()
    .refine((q) => !q || (q.startsWith("?") && /^[A-Za-z0-9._\-=&%?]*$/.test(q)), "invalid_query"),
  timeout_ms: z.number().int().min(1000).max(60000).optional(),
  brand_id: z.string().uuid().optional(),
}).strict();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Whitelist of targets that can be relayed. Anything else is rejected.
const ALLOWED_TARGETS = new Set<string>([
  "webhook-dispatcher",
  "ai-classify",
  "sla-breach-checker",
  "slo-burn-rate-monitor",
  "ticket-escalation-runner",
  "capi-event-sender",
  "automation-runner",
  "automation-jobs-dispatcher",
  "lead-digest-dispatch",
  "lead-digest-retry-dispatcher",
  "notification-webhook-dispatcher",
  "ads-stats-meta",
  "google-ads-sync",
  "sheets-export-dispatcher",
  "sheets-export-slo-check",
  "sheets-reconciliation",
  "verify-critical-triggers",
  "sales-route-dispatcher",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const cronSecret = Deno.env.get("CRON_SECRET");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !cronSecret || !anonKey) {
      console.error("[cron-relay] Missing required env vars");
      return new Response(
        JSON.stringify({ error: "server_misconfigured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Validate caller has a valid Supabase JWT (anon or service_role).
    // This is a soft additional check: Supabase already enforces verify_jwt=true.
    const authHeader = req.headers.get("authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "invalid_json" }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const parsed = RelayBodySchema.safeParse(raw);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({
          error: "VALIDATION_ERROR",
          details: parsed.error.flatten().fieldErrors,
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const body = parsed.data;

    const target = body.target.trim();
    if (!ALLOWED_TARGETS.has(target)) {
      return new Response(
        JSON.stringify({ error: "invalid_target", target }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const query = body.query ?? "";
    const targetUrl = `${supabaseUrl}/functions/v1/${target}${query}`;
    const timeoutMs = Math.min(Math.max(body.timeout_ms ?? 25000, 1000), 60000);

    // C11: lease-based lock (fail-closed). pg_try_advisory_lock leaks on poolers,
    // so we use a TTL'd row in cron_job_lease + explicit release in finally.
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const auditClient = serviceKey ? createClient(supabaseUrl, serviceKey) : null;
    const requestId = crypto.randomUUID();
    const leaseTtl = Math.ceil(timeoutMs / 1000) + 30; // upstream timeout + slack
    let leaseToken: string | null = null;

    if (auditClient) {
      try {
        const { data, error } = await auditClient.rpc("acquire_cron_lease", {
          p_job_name: target,
          p_brand_id: body.brand_id ?? null,
          p_ttl_seconds: leaseTtl,
          p_acquired_by: requestId,
        });
        if (error) {
          // Fail-closed: if we can't talk to lease store, skip rather than risk dup execution.
          console.error(`[cron-relay] lease_rpc_error target=${target}`, error.message);
          await auditClient.from("cron_relay_log").insert({
            job_name: target, brand_id: body.brand_id ?? null, request_id: requestId,
            upstream_status: 0, duration_ms: 0, error: `lease_rpc_error:${error.message}`,
          }).then(() => {}, () => {});
          return new Response(
            JSON.stringify({ ok: false, target, skipped: "lease_unavailable" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        if (data && (data as { acquired?: boolean }).acquired) {
          leaseToken = (data as { token?: string }).token ?? null;
        } else {
          console.log(`[cron-relay] target=${target} skipped (lease_held)`);
          await auditClient.from("cron_relay_log").insert({
            job_name: target, brand_id: body.brand_id ?? null, request_id: requestId,
            upstream_status: 0, duration_ms: 0, error: "lease_held",
          }).then(() => {}, () => {});
          return new Response(
            JSON.stringify({ ok: false, target, skipped: "lease_held" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[cron-relay] lease_exception target=${target}`, msg);
        return new Response(
          JSON.stringify({ ok: false, target, skipped: "lease_unavailable" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const startedAt = Date.now();
    let upstreamStatus = 0;
    let upstreamBody = "";
    let upstreamError: string | null = null;
    try {
      const upstream = await fetch(targetUrl, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "x-cron-secret": cronSecret,
          "x-request-id": requestId,
          "Authorization": `Bearer ${anonKey}`,
        },
        body: JSON.stringify(body.payload ?? {}),
      });
      upstreamStatus = upstream.status;
      upstreamBody = await upstream.text();
    } catch (e) {
      upstreamError = e instanceof Error ? e.message : String(e);
    } finally {
      clearTimeout(timeoutId);
      // C11: release lease so next tick can run immediately (before TTL expiry).
      if (auditClient && leaseToken) {
        await auditClient.rpc("release_cron_lease", {
          p_job_name: target,
          p_brand_id: body.brand_id ?? null,
          p_token: leaseToken,
        }).then(() => {}, () => {});
      }
    }

    const durationMs = Date.now() - startedAt;
    console.log(
      `[cron-relay] target=${target} status=${upstreamStatus} duration_ms=${durationMs}`,
    );

    if (auditClient) {
      await auditClient.from("cron_relay_log").insert({
        job_name: target,
        brand_id: body.brand_id ?? null,
        request_id: requestId,
        upstream_status: upstreamStatus,
        duration_ms: durationMs,
        error: upstreamError ?? (upstreamStatus >= 400 ? `http_${upstreamStatus}` : null),
      }).then(() => {}, () => {});
    }

    return new Response(
      JSON.stringify({
        ok: upstreamStatus >= 200 && upstreamStatus < 300,
        target,
        upstream_status: upstreamStatus,
        duration_ms: durationMs,
        upstream_body: upstreamBody.slice(0, 2000),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cron-relay] error:", msg);
    return new Response(
      JSON.stringify({ error: "relay_failed", details: msg }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
