import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface GA4RunReportResponse {
  rows?: Array<{
    dimensionValues?: Array<{ value: string }>;
    metricValues?: Array<{ value: string }>;
  }>;
}

async function getAccessToken(serviceAccountJson: string): Promise<string> {
  const sa = JSON.parse(serviceAccountJson);
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = btoa(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/analytics.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  );

  const keyData = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\\n/g, "");
  const binaryKey = Uint8Array.from(atob(keyData), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureInput = new TextEncoder().encode(`${header}.${payload}`);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, signatureInput);
  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const jwt = `${header}.${payload}.${sig}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Failed to get access token: ${err}`);
  }

  const tokenData = await tokenRes.json();
  return tokenData.access_token;
}

async function runReport(
  accessToken: string,
  propertyId: string,
  startDate: string,
  endDate: string,
  dimensions: string[],
  metrics: string[]
): Promise<GA4RunReportResponse> {
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
  const body = {
    dateRanges: [{ startDate, endDate }],
    dimensions: dimensions.map((d) => ({ name: d })),
    metrics: metrics.map((m) => ({ name: m })),
    limit: 50,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GA4 API error [${res.status}]: ${err}`);
  }

  return res.json();
}

function parseDateString(d: string): string {
  return `${d.substring(0, 4)}-${d.substring(4, 6)}-${d.substring(6, 8)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ga4PropertyId = Deno.env.get("GA4_PROPERTY_ID");
    const ga4ServiceAccountJson = Deno.env.get("GA4_SERVICE_ACCOUNT_JSON");

    if (!ga4PropertyId || !ga4ServiceAccountJson) {
      return new Response(
        JSON.stringify({ error: "GA4_PROPERTY_ID and GA4_SERVICE_ACCOUNT_JSON secrets are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    let brandId: string | undefined;
    let fromDate: string | undefined;
    let toDate: string | undefined;

    if (req.method === "POST") {
      try {
        const body = await req.json();
        brandId = body.brand_id;
        fromDate = body.from;
        toDate = body.to;
      } catch {
      }
    }

    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const defaultDate = yesterday.toISOString().split("T")[0];

    const startDate = fromDate || defaultDate;
    const endDate = toDate || defaultDate;

    const accessToken = await getAccessToken(ga4ServiceAccountJson);

    const dailyReport = await runReport(
      accessToken,
      ga4PropertyId,
      startDate,
      endDate,
      ["date"],
      ["sessions", "screenPageViews", "totalUsers", "newUsers", "bounceRate", "averageSessionDuration", "conversions"]
    );

    const pagesReport = await runReport(
      accessToken,
      ga4PropertyId,
      startDate,
      endDate,
      ["date", "pagePath"],
      ["screenPageViews"]
    );

    const sourcesReport = await runReport(
      accessToken,
      ga4PropertyId,
      startDate,
      endDate,
      ["date", "sessionSource", "sessionMedium"],
      ["sessions"]
    );

    const campaignsReport = await runReport(
      accessToken,
      ga4PropertyId,
      startDate,
      endDate,
      ["date", "sessionCampaignName"],
      ["sessions", "conversions"]
    );

    const convEventsReport = await runReport(
      accessToken,
      ga4PropertyId,
      startDate,
      endDate,
      ["date", "eventName"],
      ["eventCount"]
    );

    if (!brandId) {
      const { data: brands } = await supabase.from("brands").select("id").limit(1);
      brandId = brands?.[0]?.id;
    }

    if (!brandId) {
      return new Response(
        JSON.stringify({ error: "No brand_id provided and no brands found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const dailyMap: Record<string, any> = {};
    for (const row of dailyReport.rows || []) {
      const date = parseDateString(row.dimensionValues?.[0]?.value || "");
      const vals = row.metricValues || [];
      dailyMap[date] = {
        brand_id: brandId,
        stat_date: date,
        sessions: parseInt(vals[0]?.value || "0"),
        pageviews: parseInt(vals[1]?.value || "0"),
        users: parseInt(vals[2]?.value || "0"),
        new_users: parseInt(vals[3]?.value || "0"),
        bounce_rate: parseFloat(vals[4]?.value || "0"),
        avg_session_duration: parseFloat(vals[5]?.value || "0"),
        conversions: parseInt(vals[6]?.value || "0"),
        conversion_events: [],
        top_pages: [],
        top_sources: [],
        top_campaigns: [],
        imported_at: new Date().toISOString(),
      };
    }

    if (Object.keys(dailyMap).length === 0) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split("T")[0];
        dailyMap[dateStr] = {
          brand_id: brandId,
          stat_date: dateStr,
          sessions: 0, pageviews: 0, users: 0, new_users: 0,
          bounce_rate: 0, avg_session_duration: 0, conversions: 0,
          conversion_events: [], top_pages: [], top_sources: [], top_campaigns: [],
          imported_at: new Date().toISOString(),
        };
      }
    }

    for (const row of pagesReport.rows || []) {
      const date = parseDateString(row.dimensionValues?.[0]?.value || "");
      const page = row.dimensionValues?.[1]?.value || "";
      const views = parseInt(row.metricValues?.[0]?.value || "0");
      if (dailyMap[date]) {
        dailyMap[date].top_pages.push({ page, views });
      }
    }

    for (const row of sourcesReport.rows || []) {
      const date = parseDateString(row.dimensionValues?.[0]?.value || "");
      const source = row.dimensionValues?.[1]?.value || "";
      const medium = row.dimensionValues?.[2]?.value || "";
      const sessions = parseInt(row.metricValues?.[0]?.value || "0");
      if (dailyMap[date]) {
        dailyMap[date].top_sources.push({ source, medium, sessions });
      }
    }

    for (const row of campaignsReport.rows || []) {
      const date = parseDateString(row.dimensionValues?.[0]?.value || "");
      const campaign = row.dimensionValues?.[1]?.value || "";
      const sessions = parseInt(row.metricValues?.[0]?.value || "0");
      const conversions = parseInt(row.metricValues?.[1]?.value || "0");
      if (dailyMap[date]) {
        dailyMap[date].top_campaigns.push({ campaign, sessions, conversions });
      }
    }

    for (const row of convEventsReport.rows || []) {
      const date = parseDateString(row.dimensionValues?.[0]?.value || "");
      const eventName = row.dimensionValues?.[1]?.value || "";
      const count = parseInt(row.metricValues?.[0]?.value || "0");
      if (dailyMap[date]) {
        dailyMap[date].conversion_events.push({ event: eventName, count });
      }
    }

    for (const date of Object.keys(dailyMap)) {
      dailyMap[date].top_pages = dailyMap[date].top_pages
        .sort((a: any, b: any) => b.views - a.views)
        .slice(0, 10);
      dailyMap[date].top_sources = dailyMap[date].top_sources
        .sort((a: any, b: any) => b.sessions - a.sessions)
        .slice(0, 10);
      dailyMap[date].top_campaigns = dailyMap[date].top_campaigns
        .sort((a: any, b: any) => b.sessions - a.sessions)
        .slice(0, 10);
    }

    const rows = Object.values(dailyMap);
    const { error: upsertError } = await supabase
      .from("ga4_stats")
      .upsert(rows, { onConflict: "brand_id,stat_date" });

    if (upsertError) {
      throw new Error(`Upsert error: ${upsertError.message}`);
    }

    return new Response(
      JSON.stringify({ success: true, days_synced: rows.length, range: { from: startDate, to: endDate } }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("GA4 sync error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
