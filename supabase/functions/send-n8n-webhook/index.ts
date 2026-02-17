import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const n8nWebhookUrl = Deno.env.get("N8N_REPORT_WEBHOOK_URL");

    if (!n8nWebhookUrl) {
      return new Response(
        JSON.stringify({ error: "N8N_REPORT_WEBHOOK_URL not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Auth: cron secret OR JWT
    const cronSecret = req.headers.get("x-cron-secret");
    const expectedSecret = Deno.env.get("CRON_SECRET");
    const cronSecretPrev = Deno.env.get("CRON_SECRET_PREVIOUS");
    const authHeader = req.headers.get("Authorization");

    const isCronCall = cronSecret && (cronSecret === expectedSecret || cronSecret === cronSecretPrev);

    // B04 FIX: Verify JWT server-side instead of trusting decoded payload
    let isJwtCronCall = false;
    if (!isCronCall && authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      const verifyClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: claimsData, error: claimsErr } = await verifyClient.auth.getClaims(token);
      if (!claimsErr && claimsData?.claims) {
        const role = claimsData.claims.role;
        if (role === "service_role") {
          isJwtCronCall = true;
        }
      }
    }

    let userId: string | null = null;
    let isAdminCall = false;

    if (!isCronCall && !isJwtCronCall && authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      const supabaseAuth = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getUser(token);
      if (claimsError || !claimsData?.user) {
        return new Response(JSON.stringify({ error: "Invalid token" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      const { data: internalUser } = await supabase
        .from("users")
        .select("id")
        .eq("supabase_auth_id", claimsData.user.id)
        .limit(1)
        .maybeSingle();

      userId = internalUser?.id ?? null;

      const { data: userRoles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId ?? "");

      const hasAdminAccess = userRoles?.some((r) => r.role === "admin" || r.role === "ceo");
      if (!hasAdminAccess) {
        return new Response(JSON.stringify({ error: "Forbidden" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Rate limit for manual calls
      const { data: allowed } = await supabase.rpc("check_report_rate_limit", { p_user_id: userId });
      if (!allowed) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded (max 20/hour)" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      isAdminCall = true;
    }

    if (!isCronCall && !isJwtCronCall && !isAdminCall) {
      return new Response(JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body = await req.json();
    const { period = "week", from, to, brand_ids, scheduledRun } = body;

    const mode = period === "month" ? "monthly_report" : period === "week" ? "weekly_report" : "custom_report";

    // Determine brand_id for logging (use first brand or system brand)
    const logBrandId = brand_ids?.[0] || "00000000-0000-0000-0000-000000000000";

    // Create sync_run record
    // Calculate date range for logging
    const now = new Date();
    let periodFrom: string, periodTo: string;
    if (from && to) {
      periodFrom = from;
      periodTo = to;
    } else if (period === "month") {
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
      periodFrom = prev.toISOString().split("T")[0];
      periodTo = lastDay.toISOString().split("T")[0];
    } else {
      const dayOfWeek = now.getDay();
      const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const lastMonday = new Date(now);
      lastMonday.setDate(now.getDate() - diffToMonday - 7);
      const lastSunday = new Date(lastMonday);
      lastSunday.setDate(lastMonday.getDate() + 6);
      periodFrom = lastMonday.toISOString().split("T")[0];
      periodTo = lastSunday.toISOString().split("T")[0];
    }

    const { data: syncRun } = await supabase
      .from("sync_runs")
      .insert({
        brand_id: logBrandId,
        mode,
        status: "pending",
        period_from: periodFrom,
        period_to: periodTo,
        triggered_by: userId,
      })
      .select("id")
      .single();

    // Call generate-weekly-report
    const reportResponse = await fetch(`${supabaseUrl}/functions/v1/generate-weekly-report`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({ period, from, to, brand_ids }),
    });

    if (!reportResponse.ok) {
      const errText = await reportResponse.text();
      console.error("[send-n8n-webhook] Report generation failed:", errText);

      if (syncRun?.id) {
        await supabase.from("sync_runs").update({
          status: "failed",
          error_message: `Report generation failed: ${errText.substring(0, 500)}`,
          completed_at: new Date().toISOString(),
        }).eq("id", syncRun.id);
      }

      return new Response(
        JSON.stringify({ error: "Report generation failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const reportPayload = await reportResponse.json();

    // Send to n8n webhook
    console.log(`[send-n8n-webhook] Sending ${mode} report to n8n...`);
    const n8nResponse = await fetch(n8nWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reportPayload),
    });

    const n8nStatus = n8nResponse.status;
    let n8nBody = "";
    try {
      n8nBody = await n8nResponse.text();
    } catch { /* ignore */ }

    // Update sync_run
    if (syncRun?.id) {
      await supabase.from("sync_runs").update({
        status: n8nResponse.ok ? "success" : "failed",
        webhook_status_code: n8nStatus,
        webhook_response: n8nBody.substring(0, 1000),
        report_payload: { globalMetrics: reportPayload.globalMetrics, dateRange: reportPayload.dateRange, type: reportPayload.type },
        completed_at: new Date().toISOString(),
        error_message: n8nResponse.ok ? null : `n8n returned ${n8nStatus}`,
      }).eq("id", syncRun.id);
    }

    console.log(`[send-n8n-webhook] ${mode} report sent — n8n status: ${n8nStatus}`);

    return new Response(
      JSON.stringify({
        success: n8nResponse.ok,
        mode,
        n8n_status: n8nStatus,
        sync_run_id: syncRun?.id,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[send-n8n-webhook] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
