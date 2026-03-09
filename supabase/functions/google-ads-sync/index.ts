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
    console.log("[google-ads-sync] Function invoked");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const developerToken = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN")!;
    const googleClientId = Deno.env.get("GOOGLE_ADS_CLIENT_ID")!;
    const googleClientSecret = Deno.env.get("GOOGLE_ADS_CLIENT_SECRET")!;

    if (!developerToken || !googleClientId || !googleClientSecret) {
      console.error("[google-ads-sync] Missing secrets: devToken=%s clientId=%s clientSecret=%s",
        !!developerToken, !!googleClientId, !!googleClientSecret);
      return new Response(
        JSON.stringify({ error: "Google Ads secrets not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Auth check ---
    const cronSecret = req.headers.get("x-cron-secret");
    const expectedSecret = Deno.env.get("CRON_SECRET");
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const isCronCall = (cronSecret && cronSecret === expectedSecret) ||
      (authHeader === `Bearer ${anonKey}`) ||
      (authHeader === `Bearer ${serviceRoleKey}`);

    let isAdminCall = false;
    if (!isCronCall && authHeader?.startsWith("Bearer ")) {
      try {
        const token = authHeader.replace("Bearer ", "");
        const supabaseAuth = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
          global: { headers: { Authorization: authHeader } },
        });

        // Use getUser instead of getClaims for broader compatibility
        const { data: userData, error: userError } = await supabaseAuth.auth.getUser(token);
        if (userError || !userData?.user) {
          console.warn("[google-ads-sync] Auth failed for user token:", userError?.message);
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const sb = createClient(supabaseUrl, serviceKey);
        const { data: internalUser } = await sb
          .from("users")
          .select("id")
          .eq("supabase_auth_id", userData.user.id)
          .limit(1)
          .maybeSingle();

        const { data: userRoles } = await sb
          .from("user_roles")
          .select("role")
          .eq("user_id", internalUser?.id ?? "");

        if (!userRoles?.some(r => r.role === "admin" || r.role === "ceo")) {
          console.warn("[google-ads-sync] User lacks admin/ceo role");
          return new Response(JSON.stringify({ error: "Forbidden" }), {
            status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        isAdminCall = true;
      } catch (authErr) {
        console.error("[google-ads-sync] Auth check crashed:", authErr);
        return new Response(JSON.stringify({ error: "Auth check failed" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    console.log("[google-ads-sync] Auth: isCron=%s isAdmin=%s", isCronCall, isAdminCall);

    if (!isCronCall && !isAdminCall) {
      console.warn("[google-ads-sync] Rejected: no valid auth");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // --- Parse date range from query params ---
    const url = new URL(req.url);
    const fromParam = url.searchParams.get("from");
    const toParam = url.searchParams.get("to");

    const today = new Date();
    const defaultLookbackDays = 4;
    const maxLookbackDays = 30;
    const lookbackDate = new Date(today);
    lookbackDate.setDate(today.getDate() - defaultLookbackDays);

    const defaultSinceDate = lookbackDate.toISOString().split("T")[0];
    const untilDate = toParam || today.toISOString().split("T")[0];

    // --- Fetch all oauth tokens for google_ads ---
    const { data: oauthTokens, error: tokensError } = await supabase
      .from("oauth_tokens")
      .select("*")
      .eq("provider", "google_ads");

    if (tokensError) {
      console.error("Error fetching oauth_tokens:", tokensError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch tokens" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!oauthTokens?.length) {
      return new Response(
        JSON.stringify({ message: "No Google Ads accounts connected", processed: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: Array<{
      brand_id: string;
      account_id: string;
      success: boolean;
      campaigns: number;
      error?: string;
    }> = [];

    const mccId = Deno.env.get("GOOGLE_ADS_MCC_ID") || "";
    const TOKEN_REFRESH_BUFFER_MS = 10 * 60 * 1000; // 10 minuti

    for (const oauthToken of oauthTokens) {
      const customerId = oauthToken.account_id;
      let accountSinceDate = fromParam || defaultSinceDate;

      try {
        // --- Auto-backfill: check last successful sync ---
        if (!fromParam) {
          const { data: lastSync } = await supabase
            .from("ad_sync_log")
            .select("sync_to")
            .eq("provider", "google")
            .eq("account_id", customerId)
            .eq("success", true)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (lastSync?.sync_to) {
            const lastSyncDate = new Date(lastSync.sync_to);
            const daysSinceLastSync = Math.floor((today.getTime() - lastSyncDate.getTime()) / (1000 * 60 * 60 * 24));
            if (daysSinceLastSync > defaultLookbackDays) {
              const backfillDate = new Date(today);
              backfillDate.setDate(today.getDate() - Math.min(daysSinceLastSync, maxLookbackDays));
              accountSinceDate = backfillDate.toISOString().split("T")[0];
              console.log(`[google-ads-sync] Auto-backfill for ${customerId}: extending lookback to ${accountSinceDate} (${daysSinceLastSync} days gap)`);
            }
          }
        }

        console.log(`[google-ads-sync] Syncing ${customerId}: ${accountSinceDate} → ${untilDate}`);

        // --- Proactive token refresh (10 min buffer) ---
        let accessToken = oauthToken.access_token_encrypted;
        if (new Date(oauthToken.expires_at).getTime() <= Date.now() + TOKEN_REFRESH_BUFFER_MS) {
          console.log(`[google-ads-sync] Proactive refresh for ${customerId} (expires ${oauthToken.expires_at})`);
          const refreshResp = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: googleClientId,
              client_secret: googleClientSecret,
              refresh_token: oauthToken.refresh_token_encrypted,
              grant_type: "refresh_token",
            }),
          });

          const refreshData = await refreshResp.json();
          if (refreshData.error) {
            const errMsg = `Token refresh failed: ${refreshData.error}`;
            console.error(`[google-ads-sync] ${errMsg} for ${customerId}`);
            await logSyncResult(supabase, "google", customerId, oauthToken.brand_id, false, 0, accountSinceDate, untilDate, errMsg);
            results.push({ brand_id: oauthToken.brand_id, account_id: customerId, success: false, campaigns: 0, error: errMsg });
            continue;
          }

          accessToken = refreshData.access_token;
          const newExpiry = new Date(Date.now() + (refreshData.expires_in || 3600) * 1000).toISOString();
          await supabase
            .from("oauth_tokens")
            .update({ access_token_encrypted: accessToken, expires_at: newExpiry, updated_at: new Date().toISOString() })
            .eq("id", oauthToken.id);
        }

        // --- Google Ads API query ---
        const query = `
          SELECT campaign.id, campaign.name, metrics.cost_micros, metrics.impressions, metrics.clicks, segments.date
          FROM campaign
          WHERE segments.date BETWEEN '${accountSinceDate}' AND '${untilDate}'
            AND campaign.status != 'REMOVED'
          ORDER BY segments.date DESC
        `;

        const headers: Record<string, string> = {
          Authorization: `Bearer ${accessToken}`,
          "developer-token": developerToken,
          "Content-Type": "application/json",
        };
        if (mccId) headers["login-customer-id"] = mccId;

        const gaqlResp = await fetch(
          `https://googleads.googleapis.com/v20/customers/${customerId}/googleAds:searchStream`,
          { method: "POST", headers, body: JSON.stringify({ query }) }
        );

        if (!gaqlResp.ok) {
          const errText = await gaqlResp.text();
          const errMsg = `HTTP ${gaqlResp.status}: ${errText.substring(0, 200)}`;
          console.error(`[google-ads-sync] API error for ${customerId}: ${errMsg}`);
          await logSyncResult(supabase, "google", customerId, oauthToken.brand_id, false, 0, accountSinceDate, untilDate, errMsg);
          results.push({ brand_id: oauthToken.brand_id, account_id: customerId, success: false, campaigns: 0, error: errMsg });
          continue;
        }

        const gaqlData = await gaqlResp.json();

        if (gaqlData.error) {
          const errMsg = gaqlData.error.message || JSON.stringify(gaqlData.error);
          console.error(`[google-ads-sync] API error for ${customerId}:`, errMsg);
          await logSyncResult(supabase, "google", customerId, oauthToken.brand_id, false, 0, accountSinceDate, untilDate, errMsg);
          results.push({ brand_id: oauthToken.brand_id, account_id: customerId, success: false, campaigns: 0, error: errMsg });
          continue;
        }

        // --- Parse results ---
        const statsToUpsert: any[] = [];
        const batches = Array.isArray(gaqlData) ? gaqlData : [gaqlData];

        for (const batch of batches) {
          for (const row of (batch.results || [])) {
            const campaignId = row.campaign?.id?.toString() || "";
            const statDate = row.segments?.date || "";
            if (!campaignId || !statDate) continue;

            statsToUpsert.push({
              brand_id: oauthToken.brand_id,
              campaign_id: null,
              platform: "google",
              account_id: customerId,
              external_campaign_id: campaignId,
              external_campaign_name: row.campaign?.name || "",
              stat_date: statDate,
              currency: "EUR",
              spend: parseInt(row.metrics?.costMicros || "0") / 1_000_000,
              impressions: parseInt(row.metrics?.impressions || "0"),
              clicks: parseInt(row.metrics?.clicks || "0"),
              reach: 0,
              frequency: 0,
              conversions: null,
              conversions_value: null,
              raw_data: row,
              imported_at: new Date().toISOString(),
            });
          }
        }

        if (statsToUpsert.length > 0) {
          const { error: upsertError } = await supabase
            .from("ad_platform_stats")
            .upsert(statsToUpsert, {
              onConflict: "brand_id,platform,account_id,external_campaign_id,stat_date",
              ignoreDuplicates: false,
            });

          if (upsertError) {
            const errMsg = upsertError.message;
            console.error(`[google-ads-sync] Upsert error for ${customerId}:`, errMsg);
            await logSyncResult(supabase, "google", customerId, oauthToken.brand_id, false, statsToUpsert.length, accountSinceDate, untilDate, errMsg);
            results.push({ brand_id: oauthToken.brand_id, account_id: customerId, success: false, campaigns: statsToUpsert.length, error: errMsg });
            continue;
          }
        }

        console.log(`[google-ads-sync] ✅ ${customerId}: ${statsToUpsert.length} campaign-days upserted (${accountSinceDate} → ${untilDate})`);
        await logSyncResult(supabase, "google", customerId, oauthToken.brand_id, true, statsToUpsert.length, accountSinceDate, untilDate, null);
        results.push({ brand_id: oauthToken.brand_id, account_id: customerId, success: true, campaigns: statsToUpsert.length });

      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "Unknown error";
        console.error(`[google-ads-sync] Error for ${customerId}:`, err);
        await logSyncResult(supabase, "google", customerId, oauthToken.brand_id, false, 0, accountSinceDate, untilDate, errMsg);
        results.push({ brand_id: oauthToken.brand_id, account_id: customerId, success: false, campaigns: 0, error: errMsg });
      }
    }

    return new Response(
      JSON.stringify({ results, processed: results.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("google-ads-sync error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

/** Log sync result to ad_sync_log */
async function logSyncResult(
  supabase: any,
  provider: string,
  accountId: string,
  brandId: string,
  success: boolean,
  campaignsSynced: number,
  syncFrom: string,
  syncTo: string,
  errorMessage: string | null
) {
  try {
    await supabase.from("ad_sync_log").insert({
      provider,
      account_id: accountId,
      brand_id: brandId,
      success,
      campaigns_synced: campaignsSynced,
      sync_from: syncFrom,
      sync_to: syncTo,
      error_message: errorMessage,
    });
  } catch (logErr) {
    console.error("[google-ads-sync] Failed to write sync log:", logErr);
  }
}
