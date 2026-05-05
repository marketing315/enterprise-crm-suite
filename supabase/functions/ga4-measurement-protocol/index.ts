import { timingSafeEqualAny } from "../_shared/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret, x-internal-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // SECURITY: server-to-server only. Require CRON_SECRET or INTERNAL_SERVICE_TOKEN.
    const cronSecret = req.headers.get("x-cron-secret");
    const internalToken = req.headers.get("x-internal-token");
    const expectedCron = Deno.env.get("CRON_SECRET");
    const expectedCronPrev = Deno.env.get("CRON_SECRET_PREVIOUS");
    const expectedInternal = Deno.env.get("INTERNAL_SERVICE_TOKEN");
    const ok =
      (!!cronSecret && timingSafeEqualAny(cronSecret, expectedCron, expectedCronPrev)) ||
      (!!internalToken && !!expectedInternal && timingSafeEqualAny(internalToken, expectedInternal));
    if (!ok) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const measurementId = Deno.env.get("GA4_MEASUREMENT_ID");
    const apiSecret = Deno.env.get("GA4_API_SECRET");

    if (!measurementId || !apiSecret) {
      return new Response(
        JSON.stringify({ error: "GA4_MEASUREMENT_ID and GA4_API_SECRET secrets are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { event_name, client_id, user_id, params } = body;

    if (!event_name) {
      return new Response(
        JSON.stringify({ error: "event_name is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate a stable client_id if none provided
    const cid = client_id || crypto.randomUUID();

    const mpPayload: Record<string, any> = {
      client_id: cid,
      events: [
        {
          name: event_name,
          params: {
            ...params,
            engagement_time_msec: "100",
          },
        },
      ],
    };

    if (user_id) {
      mpPayload.user_id = user_id;
    }

    const url = `https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`;

    const gaRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mpPayload),
    });

    // GA4 MP returns 204 on success
    const responseText = await gaRes.text();

    return new Response(
      JSON.stringify({
        success: gaRes.ok || gaRes.status === 204,
        status: gaRes.status,
        client_id: cid,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("GA4 Measurement Protocol error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
