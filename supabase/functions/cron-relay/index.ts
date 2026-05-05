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
  "sales-route-dispatcher",
]);

interface RelayBody {
  target?: string;
  payload?: unknown;
  query?: string;
  timeout_ms?: number;
}

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

    let body: RelayBody;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "invalid_json" }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const target = (body.target || "").trim();
    if (!target || !ALLOWED_TARGETS.has(target)) {
      return new Response(
        JSON.stringify({ error: "invalid_target", target }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const query = typeof body.query === "string" && body.query.startsWith("?") ? body.query : "";
    const targetUrl = `${supabaseUrl}/functions/v1/${target}${query}`;
    const timeoutMs = Math.min(Math.max(body.timeout_ms ?? 25000, 1000), 60000);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const startedAt = Date.now();
    let upstreamStatus = 0;
    let upstreamBody = "";
    try {
      const upstream = await fetch(targetUrl, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          // The target functions accept either x-cron-secret OR service_role JWT.
          // We forward x-cron-secret from our env (never reaches the DB / pg_cron).
          "x-cron-secret": cronSecret,
          // Forward an anon Bearer so functions that still verify a JWT pass.
          "Authorization": `Bearer ${anonKey}`,
        },
        body: JSON.stringify(body.payload ?? {}),
      });
      upstreamStatus = upstream.status;
      upstreamBody = await upstream.text();
    } finally {
      clearTimeout(timeoutId);
    }

    const durationMs = Date.now() - startedAt;
    console.log(
      `[cron-relay] target=${target} status=${upstreamStatus} duration_ms=${durationMs}`,
    );

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
