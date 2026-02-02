import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

interface MetaApp {
  id: string;
  brand_id: string;
  access_token: string;
  ad_account_id: string | null;
  stats_enabled: boolean;
}

interface MetaInsight {
  campaign_id: string;
  campaign_name: string;
  spend: string;
  impressions: string;
  clicks: string;
  actions?: Array<{ action_type: string; value: string }>;
  date_start: string;
  date_stop: string;
}

interface MetaInsightsResponse {
  data: MetaInsight[];
  paging?: { next?: string };
  error?: { message: string; code: number };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify cron secret for automated calls
    const cronSecret = req.headers.get("x-cron-secret");
    const expectedSecret = Deno.env.get("CRON_SECRET");
    
    // Allow manual calls with auth header OR cron calls with secret
    const authHeader = req.headers.get("Authorization");
    const isCronCall = cronSecret && cronSecret === expectedSecret;
    const isAuthCall = authHeader?.startsWith("Bearer ");
    
    if (!isCronCall && !isAuthCall) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse optional date parameters
    const url = new URL(req.url);
    const dateParam = url.searchParams.get("date");
    const fromParam = url.searchParams.get("from");
    const toParam = url.searchParams.get("to");

    // Calculate date range
    let datePreset = "yesterday";
    let sinceDate: string | null = null;
    let untilDate: string | null = null;

    if (dateParam) {
      // Single specific date
      sinceDate = dateParam;
      untilDate = dateParam;
      datePreset = "";
    } else if (fromParam && toParam) {
      // Custom range
      sinceDate = fromParam;
      untilDate = toParam;
      datePreset = "";
    }

    // Fetch all meta_apps with stats enabled
    const { data: metaApps, error: metaAppsError } = await supabase
      .from("meta_apps")
      .select("id, brand_id, access_token, ad_account_id, stats_enabled")
      .eq("stats_enabled", true)
      .eq("is_active", true)
      .not("ad_account_id", "is", null);

    if (metaAppsError) {
      console.error("Error fetching meta_apps:", metaAppsError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch meta apps", details: metaAppsError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!metaApps || metaApps.length === 0) {
      return new Response(
        JSON.stringify({ message: "No meta apps configured for stats import", processed: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: Array<{ brand_id: string; account_id: string; success: boolean; campaigns: number; error?: string }> = [];

    for (const metaApp of metaApps as MetaApp[]) {
      if (!metaApp.ad_account_id) continue;

      const accountId = metaApp.ad_account_id.startsWith("act_") 
        ? metaApp.ad_account_id 
        : `act_${metaApp.ad_account_id}`;

      try {
        // Build Meta Insights API URL
        let insightsUrl = `https://graph.facebook.com/v20.0/${accountId}/insights?`;
        insightsUrl += `fields=campaign_id,campaign_name,spend,impressions,clicks,actions`;
        insightsUrl += `&level=campaign`;
        insightsUrl += `&time_increment=1`;
        
        if (datePreset) {
          insightsUrl += `&date_preset=${datePreset}`;
        } else if (sinceDate && untilDate) {
          insightsUrl += `&time_range={"since":"${sinceDate}","until":"${untilDate}"}`;
        }
        
        insightsUrl += `&access_token=${metaApp.access_token}`;

        console.log(`Fetching insights for account ${accountId}...`);

        const response = await fetch(insightsUrl);
        const data: MetaInsightsResponse = await response.json();

        if (data.error) {
          console.error(`Meta API error for ${accountId}:`, data.error);
          results.push({
            brand_id: metaApp.brand_id,
            account_id: accountId,
            success: false,
            campaigns: 0,
            error: data.error.message,
          });
          continue;
        }

        if (!data.data || data.data.length === 0) {
          results.push({
            brand_id: metaApp.brand_id,
            account_id: accountId,
            success: true,
            campaigns: 0,
          });
          continue;
        }

        // Process each insight row
        const statsToUpsert: Array<{
          brand_id: string;
          campaign_id: string | null;
          platform: string;
          account_id: string;
          external_campaign_id: string;
          external_campaign_name: string;
          stat_date: string;
          currency: string;
          spend: number;
          impressions: number;
          clicks: number;
          conversions: number | null;
          conversions_value: number | null;
          raw_data: Record<string, unknown>;
          imported_at: string;
        }> = [];

        for (const insight of data.data) {
          // Try to find matching campaign by external_id
          const externalId = `meta:${insight.campaign_id}`;
          const { data: matchingCampaign } = await supabase
            .from("marketing_campaigns")
            .select("id, name, allow_name_fallback")
            .eq("brand_id", metaApp.brand_id)
            .eq("external_id", externalId)
            .maybeSingle();

          let campaignId: string | null = matchingCampaign?.id ?? null;

          // Fallback to name matching if allowed and no external_id match
          if (!campaignId) {
            const { data: fallbackCampaigns } = await supabase
              .from("marketing_campaigns")
              .select("id")
              .eq("brand_id", metaApp.brand_id)
              .eq("name", insight.campaign_name)
              .eq("allow_name_fallback", true);

            if (fallbackCampaigns && fallbackCampaigns.length === 1) {
              campaignId = fallbackCampaigns[0].id;
            }
          }

          // Extract conversions from actions array
          let conversions: number | null = null;
          if (insight.actions) {
            const leadAction = insight.actions.find(a => 
              a.action_type === "lead" || 
              a.action_type === "onsite_conversion.lead_grouped"
            );
            if (leadAction) {
              conversions = parseFloat(leadAction.value);
            }
          }

          statsToUpsert.push({
            brand_id: metaApp.brand_id,
            campaign_id: campaignId,
            platform: "meta",
            account_id: accountId,
            external_campaign_id: insight.campaign_id,
            external_campaign_name: insight.campaign_name,
            stat_date: insight.date_start,
            currency: "EUR",
            spend: parseFloat(insight.spend) || 0,
            impressions: parseInt(insight.impressions) || 0,
            clicks: parseInt(insight.clicks) || 0,
            conversions,
            conversions_value: null,
            raw_data: insight as unknown as Record<string, unknown>,
            imported_at: new Date().toISOString(),
          });
        }

        // Upsert all stats for this account
        if (statsToUpsert.length > 0) {
          const { error: upsertError } = await supabase
            .from("ad_platform_stats")
            .upsert(statsToUpsert, {
              onConflict: "brand_id,platform,account_id,external_campaign_id,stat_date",
              ignoreDuplicates: false,
            });

          if (upsertError) {
            console.error(`Upsert error for ${accountId}:`, upsertError);
            results.push({
              brand_id: metaApp.brand_id,
              account_id: accountId,
              success: false,
              campaigns: 0,
              error: upsertError.message,
            });
            continue;
          }
        }

        results.push({
          brand_id: metaApp.brand_id,
          account_id: accountId,
          success: true,
          campaigns: statsToUpsert.length,
        });

      } catch (err) {
        console.error(`Error processing ${accountId}:`, err);
        results.push({
          brand_id: metaApp.brand_id,
          account_id: accountId,
          success: false,
          campaigns: 0,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const totalCampaigns = results.reduce((sum, r) => sum + r.campaigns, 0);

    return new Response(
      JSON.stringify({
        message: `Processed ${successCount}/${results.length} accounts, ${totalCampaigns} campaign-days imported`,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Edge function error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
