import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Auth: cron secret OR service JWT
  const cronSecret = req.headers.get("x-cron-secret");
  const expectedSecret = Deno.env.get("CRON_SECRET");
  const cronSecretPrev = Deno.env.get("CRON_SECRET_PREVIOUS");
  const authHeader = req.headers.get("Authorization");

  const isCronCall =
    cronSecret &&
    (cronSecret === expectedSecret || cronSecret === cronSecretPrev);

  let isServiceCall = false;
  let isAdminCall = false;
  let userId: string | null = null;

  if (!isCronCall && authHeader?.startsWith("Bearer ")) {
    const token = authHeader.replace("Bearer ", "");
    const verifyClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData } = await verifyClient.auth.getClaims(token);
    if (claimsData?.claims?.role === "service_role") {
      isServiceCall = true;
    } else {
      const { data: userData } = await verifyClient.auth.getUser(token);
      if (userData?.user) {
        const { data: internalUser } = await supabase
          .from("users")
          .select("id")
          .eq("supabase_auth_id", userData.user.id)
          .maybeSingle();

        if (internalUser?.id) {
          userId = internalUser.id;
          const { data: roles } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", userId);

          if (roles?.some((r) => r.role === "admin" || r.role === "ceo")) {
            isAdminCall = true;
          }
        }
      }
    }
  }

  if (!isCronCall && !isServiceCall && !isAdminCall) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Find failed runs due for retry
    const now = new Date().toISOString();
    const { data: pendingRetries, error: fetchErr } = await supabase
      .from("lead_digest_runs")
      .select("id, window_start, window_end, attempt_no")
      .eq("status", "failed")
      .lte("scheduled_for_retry_at", now)
      .order("scheduled_for_retry_at", { ascending: true })
      .limit(10);

    if (fetchErr) throw fetchErr;

    if (!pendingRetries || pendingRetries.length === 0) {
      return new Response(JSON.stringify({ dispatched: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[lead-digest-retry-dispatcher] Found ${pendingRetries.length} runs to retry`);

    let dispatched = 0;

    for (const run of pendingRetries) {
      // Mark as pending to prevent duplicate processing
      await supabase
        .from("lead_digest_runs")
        .update({ scheduled_for_retry_at: null })
        .eq("id", run.id)
        .eq("status", "failed");

      // Call dispatch function with the original window
      try {
        const dispatchResponse = await fetch(
          `${supabaseUrl}/functions/v1/lead-digest-dispatch`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({
              trigger_type: "retry",
              force_window_start: run.window_start,
              retry_of_run_id: run.id,
            }),
            signal: AbortSignal.timeout(60000),
          }
        );

        const result = await dispatchResponse.json();
        console.log(`[lead-digest-retry-dispatcher] Run ${run.id} retry: ${result.success ? "success" : "failed"}`);

        // If retry dispatch succeeded, update original run status
        if (result.success) {
          await supabase
            .from("lead_digest_runs")
            .update({ status: "sent", scheduled_for_retry_at: null, error_message: null })
            .eq("id", run.id);
        }

        dispatched++;
      } catch (err) {
        console.error(`[lead-digest-retry-dispatcher] Error retrying run ${run.id}:`, err);
        // Re-schedule for another retry in 10 min
        const nextRetry = new Date(Date.now() + 10 * 60 * 1000).toISOString();
        await supabase
          .from("lead_digest_runs")
          .update({ scheduled_for_retry_at: nextRetry })
          .eq("id", run.id);
      }
    }

    return new Response(JSON.stringify({ dispatched }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[lead-digest-retry-dispatcher] Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
