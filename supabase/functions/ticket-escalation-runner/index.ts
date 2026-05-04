import { createClient } from "npm:@supabase/supabase-js@2";
import { timingSafeEqualAny } from "../_shared/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

/**
 * Cron-driven escalation runner for SLA-breached tickets.
 * Runs every 5 minutes; calls escalate_all_brands_breached_tickets()
 * which raises escalation_level on tickets in breach > 30/120/480 min,
 * notifies the brand manager and emits an action_suggestion.
 *
 * Auth: x-cron-secret OR service-role JWT OR the validated cron anon JWT.
 */
Deno.serve(async (req: Request) => {
  const correlationId = crypto.randomUUID();
  const log = (level: string, msg: string, extra?: Record<string, unknown>) =>
    console[level as "log" | "error"]?.(
      JSON.stringify({
        ts: new Date().toISOString(),
        correlation_id: correlationId,
        fn: "ticket-escalation-runner",
        level,
        msg,
        ...extra,
      }),
    );

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Auth: shared secret OR JWT
    const cronSecret = req.headers.get("x-cron-secret");
    const expectedSecret = Deno.env.get("CRON_SECRET");
    const expectedSecretPrev = Deno.env.get("CRON_SECRET_PREVIOUS");
    const authHeader = req.headers.get("authorization") || "";

    const hasValidCronSecret = !!(expectedSecret && cronSecret &&
      timingSafeEqualAny(cronSecret, expectedSecret, expectedSecretPrev));

    // SECURITY: only x-cron-secret or service_role JWT verified server-side.
    let hasValidJwt = false;
    if (!hasValidCronSecret && authHeader.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      try {
        const verifyClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          global: { headers: { Authorization: authHeader } },
        });
        const { data: claimsData, error: claimsErr } =
          await verifyClient.auth.getClaims(token);
        if (!claimsErr && claimsData?.claims) {
          const role = claimsData.claims.role as string;
          if (role === "service_role") {
            hasValidJwt = true;
          }
        }
      } catch {
        /* invalid */
      }
    }

    if (!hasValidCronSecret && !hasValidJwt) {
      log("error", "unauthorized");
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data, error } = await supabase.rpc(
      "escalate_all_brands_breached_tickets",
    );

    if (error) {
      log("error", "escalation rpc failed", { error: error.message });
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    log("log", "escalation completed", { result: data });

    return new Response(JSON.stringify({ success: true, result: data }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    log("error", "unexpected error", { error: String(err) });
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
