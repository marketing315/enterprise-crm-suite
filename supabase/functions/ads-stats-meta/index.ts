import { createClient } from "npm:@supabase/supabase-js@2";

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

interface CampaignMatch {
  id: string;
  external_id: string | null;
  name: string;
  allow_name_fallback: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Security: Check authorization
    const cronSecret = req.headers.get("x-cron-secret");
    const expectedSecret = Deno.env.get("CRON_SECRET");
    const authHeader = req.headers.get("Authorization");
    
    const isCronCall = cronSecret && cronSecret === expectedSecret;
    
    // For manual calls, verify admin/CEO role
    let isAdminCall = false;
    if (!isCronCall && authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      const supabaseAuth = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } }
      });
      
      const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getUser(token);
      if (claimsError || !claimsData?.user) {
        return new Response(
          JSON.stringify({ error: "Invalid token" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      // Resolve internal user_id from supabase_auth_id
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      const { data: internalUser } = await supabase
        .from("users")
        .select("id")
        .eq("supabase_auth_id", claimsData.user.id)
        .limit(1)
        .maybeSingle();

      // Check if user has admin or ceo role
      const { data: userRoles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", internalUser?.id ?? "");
      
      const hasAdminAccess = userRoles?.some(r => 
        r.role === "admin" || r.role === "ceo"
      );
      
      if (!hasAdminAccess) {
        return new Response(
          JSON.stringify({ error: "Forbidden: Admin or CEO role required" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      isAdminCall = true;
    }
    
    if (!isCronCall && !isAdminCall) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
      sinceDate = dateParam;
      untilDate = dateParam;
      datePreset = "";
    } else if (fromParam && toParam) {
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
        // Fetch all insights with pagination
        let allInsights: MetaInsight[] = [];
        let nextUrl: string | null = null;
        
        // Build initial Meta Insights API URL
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

        // Paginate through all results
        let currentUrl: string | null = insightsUrl;
        let pageCount = 0;
        const maxPages = 100; // Safety limit
        
        while (currentUrl && pageCount < maxPages) {
          const response = await fetch(currentUrl);
          const data: MetaInsightsResponse = await response.json();

          if (data.error) {
            console.error(`[ads-stats-meta] Meta API error:`, {
              account_id: accountId,
              brand_id: metaApp.brand_id,
              error_code: data.error.code,
              error_message: data.error.message,
              date_range: datePreset || `${sinceDate}-${untilDate}`,
            });
            results.push({
              brand_id: metaApp.brand_id,
              account_id: accountId,
              success: false,
              campaigns: 0,
              error: data.error.message,
            });
            currentUrl = null;
            break;
          }

          if (data.data && data.data.length > 0) {
            allInsights = allInsights.concat(data.data);
          }
          
          // Check for next page
          currentUrl = data.paging?.next || null;
          pageCount++;
        }

        if (allInsights.length === 0) {
          results.push({
            brand_id: metaApp.brand_id,
            account_id: accountId,
            success: true,
            campaigns: 0,
          });
          continue;
        }

        // BATCH CAMPAIGN MATCHING: Fetch all campaigns for this brand at once
        const externalIds = allInsights.map(i => `meta:${i.campaign_id}`);
        const campaignNames = allInsights.map(i => i.campaign_name);
        
        const { data: matchingCampaigns } = await supabase
          .from("marketing_campaigns")
          .select("id, external_id, name, allow_name_fallback")
          .eq("brand_id", metaApp.brand_id)
          .or(`external_id.in.(${externalIds.map(e => `"${e}"`).join(',')}),and(allow_name_fallback.eq.true,name.in.(${campaignNames.map(n => `"${n.replace(/"/g, '\\"')}"`).join(',')}))`);
        
        // Build lookup maps
        const campaignByExternalId = new Map<string, string>();
        const campaignsByName = new Map<string, CampaignMatch[]>();
        
        for (const camp of (matchingCampaigns || []) as CampaignMatch[]) {
          if (camp.external_id) {
            campaignByExternalId.set(camp.external_id, camp.id);
          }
          if (camp.allow_name_fallback) {
            const existing = campaignsByName.get(camp.name) || [];
            existing.push(camp);
            campaignsByName.set(camp.name, existing);
          }
        }

        // Process each insight row using the pre-fetched maps
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

        for (const insight of allInsights) {
          // Try to find matching campaign by external_id first
          const externalId = `meta:${insight.campaign_id}`;
          let campaignId: string | null = campaignByExternalId.get(externalId) ?? null;

          // Fallback to name matching if allowed and no external_id match
          if (!campaignId) {
            const nameMatches = campaignsByName.get(insight.campaign_name);
            // Only use name fallback if exactly one match (univocal)
            if (nameMatches && nameMatches.length === 1) {
              campaignId = nameMatches[0].id;
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
            currency: "EUR", // TODO: Fetch from account settings
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
