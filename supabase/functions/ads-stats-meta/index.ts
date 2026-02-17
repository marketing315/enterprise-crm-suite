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
  reach?: string;
  frequency?: string;
  actions?: Array<{ action_type: string; value: string }>;
  date_start: string;
  date_stop: string;
}

interface MetaAdInsight {
  campaign_id: string;
  campaign_name: string;
  ad_id: string;
  ad_name: string;
  spend: string;
  impressions: string;
  clicks: string;
  reach?: string;
  frequency?: string;
  date_start: string;
  date_stop: string;
}

interface MetaDemoInsight {
  campaign_id: string;
  spend: string;
  impressions: string;
  clicks: string;
  reach?: string;
  age?: string;
  gender?: string;
  date_start: string;
  date_stop: string;
}

interface MetaInsightsResponse {
  data: MetaInsight[];
  paging?: { next?: string };
  error?: { message: string; code: number };
}

interface MetaAdInsightsResponse {
  data: MetaAdInsight[];
  paging?: { next?: string };
  error?: { message: string; code: number };
}

interface CampaignMatch {
  id: string;
  external_id: string | null;
  name: string;
  allow_name_fallback: boolean;
}

// Fetch ad thumbnails in batch
async function fetchAdThumbnails(
  adIds: string[],
  accessToken: string
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (adIds.length === 0) return map;

  // Use batch API - fetch 50 at a time
  const batchSize = 50;
  for (let i = 0; i < adIds.length; i += batchSize) {
    const batch = adIds.slice(i, i + batchSize);
    const ids = batch.join(",");
    try {
      const resp = await fetch(
        `https://graph.facebook.com/v20.0/?ids=${ids}&fields=creative{thumbnail_url}&access_token=${accessToken}`
      );
      const data = await resp.json();
      if (data && !data.error) {
        for (const [adId, adData] of Object.entries(data as Record<string, any>)) {
          const thumbUrl = adData?.creative?.data?.[0]?.thumbnail_url 
            || adData?.creative?.thumbnail_url;
          if (thumbUrl) map.set(adId, thumbUrl);
        }
      }
    } catch (err) {
      console.warn("Failed to fetch thumbnails batch:", err);
    }
  }
  return map;
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
    const cronSecretPrev = Deno.env.get("CRON_SECRET_PREVIOUS");
    const authHeader = req.headers.get("Authorization");
    
    const isCronCall = cronSecret && (cronSecret === expectedSecret || cronSecret === cronSecretPrev);
    
    // H03 FIX: Verify JWT server-side instead of trusting decoded payload
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

    let isAdminCall = false;
    if (!isCronCall && !isJwtCronCall && authHeader?.startsWith("Bearer ")) {
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
      
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      const { data: internalUser } = await supabase
        .from("users")
        .select("id")
        .eq("supabase_auth_id", claimsData.user.id)
        .limit(1)
        .maybeSingle();

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
    
    if (!isCronCall && !isJwtCronCall && !isAdminCall) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const url = new URL(req.url);
    const dateParam = url.searchParams.get("date");
    const fromParam = url.searchParams.get("from");
    const toParam = url.searchParams.get("to");

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

    const results: Array<{ brand_id: string; account_id: string; success: boolean; campaigns: number; ads?: number; demographics?: number; error?: string }> = [];

    for (const metaApp of metaApps as MetaApp[]) {
      if (!metaApp.ad_account_id) continue;

      const accountId = metaApp.ad_account_id.startsWith("act_") 
        ? metaApp.ad_account_id 
        : `act_${metaApp.ad_account_id}`;

      try {
        // ---- CAMPAIGN-LEVEL INSIGHTS ----
        let allInsights: MetaInsight[] = [];
        
        let insightsUrl = `https://graph.facebook.com/v20.0/${accountId}/insights?`;
        insightsUrl += `fields=campaign_id,campaign_name,spend,impressions,clicks,reach,frequency,actions`;
        insightsUrl += `&level=campaign&time_increment=1`;
        
        if (datePreset) {
          insightsUrl += `&date_preset=${datePreset}`;
        } else if (sinceDate && untilDate) {
          insightsUrl += `&time_range={"since":"${sinceDate}","until":"${untilDate}"}`;
        }
        insightsUrl += `&access_token=${metaApp.access_token}`;

        console.log(`Fetching campaign insights for account ${accountId}...`);

        let currentUrl: string | null = insightsUrl;
        let pageCount = 0;
        const maxPages = 100;
        
        while (currentUrl && pageCount < maxPages) {
          const response = await fetch(currentUrl);
          const data: MetaInsightsResponse = await response.json();

          if (data.error) {
            console.error(`[ads-stats-meta] Meta API error:`, {
              account_id: accountId, brand_id: metaApp.brand_id,
              error_code: data.error.code, error_message: data.error.message,
            });
            results.push({ brand_id: metaApp.brand_id, account_id: accountId, success: false, campaigns: 0, error: data.error.message });
            currentUrl = null;
            break;
          }

          if (data.data?.length) allInsights = allInsights.concat(data.data);
          currentUrl = data.paging?.next || null;
          pageCount++;
        }

        // ---- AD-LEVEL INSIGHTS ----
        let allAdInsights: MetaAdInsight[] = [];

        let adInsightsUrl = `https://graph.facebook.com/v20.0/${accountId}/insights?`;
        adInsightsUrl += `fields=campaign_id,campaign_name,ad_id,ad_name,spend,impressions,clicks,reach,frequency`;
        adInsightsUrl += `&level=ad&time_increment=1`;
        
        if (datePreset) {
          adInsightsUrl += `&date_preset=${datePreset}`;
        } else if (sinceDate && untilDate) {
          adInsightsUrl += `&time_range={"since":"${sinceDate}","until":"${untilDate}"}`;
        }
        adInsightsUrl += `&access_token=${metaApp.access_token}`;

        console.log(`Fetching ad-level insights for account ${accountId}...`);

        let adCurrentUrl: string | null = adInsightsUrl;
        let adPageCount = 0;

        while (adCurrentUrl && adPageCount < maxPages) {
          const response = await fetch(adCurrentUrl);
          const data: MetaAdInsightsResponse = await response.json();

          if (data.error) {
            console.warn(`[ads-stats-meta] Ad-level API error for ${accountId}:`, data.error.message);
            adCurrentUrl = null;
            break;
          }

          if (data.data?.length) allAdInsights = allAdInsights.concat(data.data);
          adCurrentUrl = data.paging?.next || null;
          adPageCount++;
        }

        // Fetch thumbnails for unique ad IDs
        const uniqueAdIds = [...new Set(allAdInsights.map(a => a.ad_id))];
        const thumbnails = await fetchAdThumbnails(uniqueAdIds, metaApp.access_token);

        // ---- CAMPAIGN MATCHING (shared) ----
        const externalIds = allInsights.map(i => `meta:${i.campaign_id}`);
        const campaignNames = allInsights.map(i => i.campaign_name);
        
        const { data: matchingCampaigns } = await supabase
          .from("marketing_campaigns")
          .select("id, external_id, name, allow_name_fallback")
          .eq("brand_id", metaApp.brand_id)
          .or(`external_id.in.(${externalIds.map(e => `"${e}"`).join(',')}),and(allow_name_fallback.eq.true,name.in.(${campaignNames.map(n => `"${n.replace(/"/g, '\\"')}"`).join(',')}))`);
        
        const campaignByExternalId = new Map<string, string>();
        const campaignsByName = new Map<string, CampaignMatch[]>();
        
        for (const camp of (matchingCampaigns || []) as CampaignMatch[]) {
          if (camp.external_id) campaignByExternalId.set(camp.external_id, camp.id);
          if (camp.allow_name_fallback) {
            const existing = campaignsByName.get(camp.name) || [];
            existing.push(camp);
            campaignsByName.set(camp.name, existing);
          }
        }

        // ---- UPSERT CAMPAIGN STATS ----
        const statsToUpsert: any[] = [];

        for (const insight of allInsights) {
          const externalId = `meta:${insight.campaign_id}`;
          let campaignId: string | null = campaignByExternalId.get(externalId) ?? null;
          if (!campaignId) {
            const nameMatches = campaignsByName.get(insight.campaign_name);
            if (nameMatches?.length === 1) campaignId = nameMatches[0].id;
          }

          let conversions: number | null = null;
          if (insight.actions) {
            const leadAction = insight.actions.find(a => 
              a.action_type === "lead" || a.action_type === "onsite_conversion.lead_grouped"
            );
            if (leadAction) conversions = parseFloat(leadAction.value);
          }

          statsToUpsert.push({
            brand_id: metaApp.brand_id, campaign_id: campaignId,
            platform: "meta", account_id: accountId,
            external_campaign_id: insight.campaign_id,
            external_campaign_name: insight.campaign_name,
            stat_date: insight.date_start, currency: "EUR",
            spend: parseFloat(insight.spend) || 0,
            impressions: parseInt(insight.impressions) || 0,
            clicks: parseInt(insight.clicks) || 0,
            reach: parseInt(insight.reach || "0") || 0,
            frequency: parseFloat(insight.frequency || "0") || 0,
            conversions, conversions_value: null,
            raw_data: insight as unknown as Record<string, unknown>,
            imported_at: new Date().toISOString(),
          });
        }

        if (statsToUpsert.length > 0) {
          const { error: upsertError } = await supabase
            .from("ad_platform_stats")
            .upsert(statsToUpsert, {
              onConflict: "brand_id,platform,account_id,external_campaign_id,stat_date",
              ignoreDuplicates: false,
            });
          if (upsertError) {
            console.error(`Campaign upsert error for ${accountId}:`, upsertError);
          }
        }

        // ---- UPSERT AD CREATIVE STATS ----
        let adsUpserted = 0;
        if (allAdInsights.length > 0) {
          const adStatsToUpsert = allAdInsights.map(ad => ({
            brand_id: metaApp.brand_id,
            platform: "meta",
            account_id: accountId,
            external_campaign_id: ad.campaign_id,
            external_campaign_name: ad.campaign_name,
            external_ad_id: ad.ad_id,
            external_ad_name: ad.ad_name,
            thumbnail_url: thumbnails.get(ad.ad_id) || null,
            stat_date: ad.date_start,
            currency: "EUR",
            spend: parseFloat(ad.spend) || 0,
            impressions: parseInt(ad.impressions) || 0,
            clicks: parseInt(ad.clicks) || 0,
            reach: parseInt(ad.reach || "0") || 0,
            frequency: parseFloat(ad.frequency || "0") || 0,
            imported_at: new Date().toISOString(),
          }));

          const { error: adUpsertError } = await supabase
            .from("ad_creative_stats")
            .upsert(adStatsToUpsert, {
              onConflict: "brand_id,platform,account_id,external_ad_id,stat_date",
              ignoreDuplicates: false,
            });

          if (adUpsertError) {
            console.error(`Ad creative upsert error for ${accountId}:`, adUpsertError);
          } else {
            adsUpserted = adStatsToUpsert.length;
          }
        }

        // ---- DEMOGRAPHIC BREAKDOWN ----
        let allDemoInsights: MetaDemoInsight[] = [];

        let demoUrl = `https://graph.facebook.com/v20.0/${accountId}/insights?`;
        demoUrl += `fields=campaign_id,spend,impressions,clicks,reach`;
        demoUrl += `&level=campaign&time_increment=1`;
        demoUrl += `&breakdowns=age,gender`;

        if (datePreset) {
          demoUrl += `&date_preset=${datePreset}`;
        } else if (sinceDate && untilDate) {
          demoUrl += `&time_range={"since":"${sinceDate}","until":"${untilDate}"}`;
        }
        demoUrl += `&access_token=${metaApp.access_token}`;

        console.log(`Fetching demographic breakdown for account ${accountId}...`);

        let demoCurrentUrl: string | null = demoUrl;
        let demoPageCount = 0;

        while (demoCurrentUrl && demoPageCount < maxPages) {
          const response = await fetch(demoCurrentUrl);
          const data = await response.json();

          if (data.error) {
            console.warn(`[ads-stats-meta] Demographics API error for ${accountId}:`, data.error.message);
            demoCurrentUrl = null;
            break;
          }

          if (data.data?.length) allDemoInsights = allDemoInsights.concat(data.data);
          demoCurrentUrl = data.paging?.next || null;
          demoPageCount++;
        }

        let demosUpserted = 0;
        if (allDemoInsights.length > 0) {
          const demoStatsToUpsert = allDemoInsights.map((d: MetaDemoInsight) => ({
            brand_id: metaApp.brand_id,
            platform: "meta",
            account_id: accountId,
            external_campaign_id: d.campaign_id,
            stat_date: d.date_start,
            age_range: d.age || "unknown",
            gender: d.gender || "unknown",
            spend: parseFloat(d.spend) || 0,
            impressions: parseInt(d.impressions) || 0,
            clicks: parseInt(d.clicks) || 0,
            reach: parseInt(d.reach || "0") || 0,
            imported_at: new Date().toISOString(),
          }));

          const { error: demoUpsertError } = await supabase
            .from("ad_demographic_stats")
            .upsert(demoStatsToUpsert, {
              onConflict: "brand_id,platform,account_id,external_campaign_id,stat_date,age_range,gender",
              ignoreDuplicates: false,
            });

          if (demoUpsertError) {
            console.error(`Demographics upsert error for ${accountId}:`, demoUpsertError);
          } else {
            demosUpserted = demoStatsToUpsert.length;
          }
        }

        results.push({
          brand_id: metaApp.brand_id, account_id: accountId,
          success: true, campaigns: statsToUpsert.length, ads: adsUpserted, demographics: demosUpserted,
        });

      } catch (err) {
        console.error(`Error processing ${accountId}:`, err);
        results.push({
          brand_id: metaApp.brand_id, account_id: accountId,
          success: false, campaigns: 0,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const totalCampaigns = results.reduce((sum, r) => sum + r.campaigns, 0);
    const totalAds = results.reduce((sum, r) => sum + (r.ads || 0), 0);

    return new Response(
      JSON.stringify({
        message: `Processed ${successCount}/${results.length} accounts, ${totalCampaigns} campaign-days, ${totalAds} ad-days imported`,
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
