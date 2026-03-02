import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

interface GoogleAdsRow {
  campaign_id: string;
  campaign_name: string;
  metrics_cost_micros: string;
  metrics_impressions: string;
  metrics_clicks: string;
  segments_date: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const developerToken = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN")!;
    const googleClientId = Deno.env.get("GOOGLE_ADS_CLIENT_ID")!;
    const googleClientSecret = Deno.env.get("GOOGLE_ADS_CLIENT_SECRET")!;

    if (!developerToken || !googleClientId || !googleClientSecret) {
      return new Response(
        JSON.stringify({ error: "Google Ads secrets not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Auth check: cron secret, anon key (pg_cron), or admin JWT
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
      const token = authHeader.replace("Bearer ", "");
      const supabaseAuth = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
      if (claimsError || !claimsData?.claims) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const supabase = createClient(supabaseUrl, serviceKey);
      const { data: internalUser } = await supabase
        .from("users")
        .select("id")
        .eq("supabase_auth_id", claimsData.claims.sub)
        .limit(1)
        .maybeSingle();

      const { data: userRoles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", internalUser?.id ?? "");

      if (!userRoles?.some(r => r.role === "admin" || r.role === "ceo")) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      isAdminCall = true;
    }

    if (!isCronCall && !isAdminCall) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Parse date range from query params
    const url = new URL(req.url);
    const fromParam = url.searchParams.get("from");
    const toParam = url.searchParams.get("to");

    const today = new Date();
    // Use 4-day lookback window to handle Google Ads delayed data finalization
    const lookbackDays = 4;
    const lookbackDate = new Date(today);
    lookbackDate.setDate(today.getDate() - lookbackDays);

    const sinceDate = fromParam || lookbackDate.toISOString().split("T")[0];
    const untilDate = toParam || today.toISOString().split("T")[0];

    console.log(`[google-ads-sync] Starting sync: ${sinceDate} → ${untilDate}`);

    // Fetch all oauth tokens for google_ads
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

    for (const oauthToken of oauthTokens) {
      try {
        // Refresh token if expired
        let accessToken = oauthToken.access_token_encrypted;
        if (new Date(oauthToken.expires_at) <= new Date()) {
          console.log(`Refreshing token for account ${oauthToken.account_id}...`);
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
            console.error(`Token refresh failed for ${oauthToken.account_id}:`, refreshData);
            results.push({
              brand_id: oauthToken.brand_id,
              account_id: oauthToken.account_id,
              success: false,
              campaigns: 0,
              error: `Token refresh failed: ${refreshData.error}`,
            });
            continue;
          }

          accessToken = refreshData.access_token;
          const newExpiry = new Date(Date.now() + (refreshData.expires_in || 3600) * 1000).toISOString();

          await supabase
            .from("oauth_tokens")
            .update({
              access_token_encrypted: accessToken,
              expires_at: newExpiry,
              updated_at: new Date().toISOString(),
            })
            .eq("id", oauthToken.id);
        }

        // Use Google Ads API (GAQL) to fetch campaign stats
        const customerId = oauthToken.account_id;
        const query = `
          SELECT
            campaign.id,
            campaign.name,
            metrics.cost_micros,
            metrics.impressions,
            metrics.clicks,
            segments.date
          FROM campaign
          WHERE segments.date BETWEEN '${sinceDate}' AND '${untilDate}'
            AND campaign.status != 'REMOVED'
          ORDER BY segments.date DESC
        `;

        // Try with MCC login-customer-id header (manager account)
        const mccId = Deno.env.get("GOOGLE_ADS_MCC_ID") || "";
        const headers: Record<string, string> = {
          Authorization: `Bearer ${accessToken}`,
          "developer-token": developerToken,
          "Content-Type": "application/json",
        };
        if (mccId) {
          headers["login-customer-id"] = mccId;
        }

        const gaqlResp = await fetch(
          `https://googleads.googleapis.com/v20/customers/${customerId}/googleAds:searchStream`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ query }),
          }
        );

        if (!gaqlResp.ok) {
          const errText = await gaqlResp.text();
          console.error(`Google Ads API HTTP ${gaqlResp.status} for ${customerId}:`, errText);
          results.push({
            brand_id: oauthToken.brand_id,
            account_id: customerId,
            success: false,
            campaigns: 0,
            error: `HTTP ${gaqlResp.status}: ${errText.substring(0, 200)}`,
          });
          continue;
        }

        const gaqlData = await gaqlResp.json();

        if (gaqlData.error) {
          console.error(`Google Ads API error for ${customerId}:`, gaqlData.error);
          results.push({
            brand_id: oauthToken.brand_id,
            account_id: customerId,
            success: false,
            campaigns: 0,
            error: gaqlData.error.message || JSON.stringify(gaqlData.error),
          });
          continue;
        }

        // Parse results from searchStream (returns array of batches)
        const statsToUpsert: any[] = [];
        const batches = Array.isArray(gaqlData) ? gaqlData : [gaqlData];

        for (const batch of batches) {
          const rows = batch.results || [];
          for (const row of rows) {
            const campaignId = row.campaign?.id?.toString() || "";
            const campaignName = row.campaign?.name || "";
            const costMicros = parseInt(row.metrics?.costMicros || "0");
            const impressions = parseInt(row.metrics?.impressions || "0");
            const clicks = parseInt(row.metrics?.clicks || "0");
            const statDate = row.segments?.date || "";

            if (!campaignId || !statDate) continue;

            statsToUpsert.push({
              brand_id: oauthToken.brand_id,
              campaign_id: null, // TODO: match with internal campaigns
              platform: "google",
              account_id: customerId,
              external_campaign_id: campaignId,
              external_campaign_name: campaignName,
              stat_date: statDate,
              currency: "EUR",
              spend: costMicros / 1_000_000,
              impressions,
              clicks,
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
            console.error(`Upsert error for ${customerId}:`, upsertError);
            results.push({
              brand_id: oauthToken.brand_id,
              account_id: customerId,
              success: false,
              campaigns: statsToUpsert.length,
              error: upsertError.message,
            });
            continue;
          }
        }

        console.log(`[google-ads-sync] ✅ ${customerId}: ${statsToUpsert.length} campaign-days upserted (${sinceDate} → ${untilDate})`);
        results.push({
          brand_id: oauthToken.brand_id,
          account_id: customerId,
          success: true,
          campaigns: statsToUpsert.length,
        });
      } catch (err) {
        console.error(`Error processing account ${oauthToken.account_id}:`, err);
        results.push({
          brand_id: oauthToken.brand_id,
          account_id: oauthToken.account_id,
          success: false,
          campaigns: 0,
          error: err instanceof Error ? err.message : "Unknown error",
        });
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
