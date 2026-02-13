import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ReportParams {
  period: "week" | "month" | "custom";
  from?: string;
  to?: string;
  brand_ids?: string[];
}

interface BrandMetrics {
  brand_id: string;
  brand_name: string;
  total_spend: number;
  total_impressions: number;
  total_clicks: number;
  total_reach: number;
  total_conversions: number;
  avg_ctr: number;
  avg_cpc: number;
  avg_cpm: number;
  campaigns: CampaignMetrics[];
  lead_count: number;
  manual_lead_count: number;
}

interface CampaignMetrics {
  external_campaign_id: string;
  external_campaign_name: string;
  total_spend: number;
  total_impressions: number;
  total_clicks: number;
  total_conversions: number;
  ctr: number;
  cpc: number;
}

interface GlobalMetrics {
  total_spend: number;
  total_leads: number;
  total_conversions: number;
  avg_cpl: number | null;
  avg_ctr: number;
  total_reach: number;
}

function calculateDateRange(period: string, from?: string, to?: string): { from: string; to: string } {
  const now = new Date();

  if (period === "custom" && from && to) {
    return { from, to };
  }

  if (period === "month") {
    // Previous full month
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
    return {
      from: prevMonth.toISOString().split("T")[0],
      to: lastDay.toISOString().split("T")[0],
    };
  }

  // Default: previous week (Mon-Sun)
  const dayOfWeek = now.getDay();
  const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const lastMonday = new Date(now);
  lastMonday.setDate(now.getDate() - diffToMonday - 7);
  const lastSunday = new Date(lastMonday);
  lastSunday.setDate(lastMonday.getDate() + 6);

  return {
    from: lastMonday.toISOString().split("T")[0],
    to: lastSunday.toISOString().split("T")[0],
  };
}

function trendIndicator(current: number, previous: number): string {
  if (previous === 0) return current > 0 ? "↑" : "=";
  const change = ((current - previous) / previous) * 100;
  if (change > 5) return `↑ +${change.toFixed(1)}%`;
  if (change < -5) return `↓ ${change.toFixed(1)}%`;
  return "= ~0%";
}

function formatCurrency(val: number): string {
  return `€${val.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function generateHTML(
  global: GlobalMetrics,
  brands: BrandMetrics[],
  dateRange: { from: string; to: string },
  period: string,
  prevGlobal?: GlobalMetrics
): string {
  const periodLabel =
    period === "week" ? "Settimanale" : period === "month" ? "Mensile" : "Personalizzato";

  const brandRanking = [...brands]
    .filter((b) => b.lead_count > 0)
    .sort((a, b) => {
      const cplA = a.total_spend / a.lead_count;
      const cplB = b.total_spend / b.lead_count;
      return cplA - cplB;
    });

  // Find best/worst campaigns across all brands
  const allCampaigns = brands.flatMap((b) =>
    b.campaigns.map((c) => ({ ...c, brand_name: b.brand_name }))
  );
  const bestCampaign = allCampaigns.length
    ? allCampaigns.reduce((best, c) => (c.ctr > best.ctr ? c : best))
    : null;
  const worstCampaign = allCampaigns.length
    ? allCampaigns.reduce((worst, c) => (c.ctr < worst.ctr ? c : worst))
    : null;

  let html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a2e; margin: 0; padding: 20px; background: #f5f5f5; }
  .container { max-width: 700px; margin: 0 auto; background: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
  h1 { color: #1a1a2e; font-size: 24px; margin-bottom: 4px; }
  h2 { color: #4361ee; font-size: 18px; margin-top: 28px; border-bottom: 2px solid #4361ee; padding-bottom: 6px; }
  h3 { color: #333; font-size: 15px; margin-top: 16px; }
  .subtitle { color: #666; font-size: 14px; margin-bottom: 24px; }
  .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 16px 0; }
  .kpi-card { background: #f8f9fa; border-radius: 8px; padding: 14px; text-align: center; }
  .kpi-value { font-size: 22px; font-weight: 700; color: #1a1a2e; }
  .kpi-label { font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px; }
  .kpi-trend { font-size: 11px; margin-top: 2px; }
  .trend-up { color: #22c55e; }
  .trend-down { color: #ef4444; }
  .trend-flat { color: #666; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px; }
  th { background: #f1f3f5; padding: 8px 10px; text-align: left; font-weight: 600; }
  td { padding: 8px 10px; border-bottom: 1px solid #eee; }
  .text-right { text-align: right; }
  .highlight { background: #e8f4fd; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
  .badge-best { background: #dcfce7; color: #166534; }
  .badge-worst { background: #fef2f2; color: #991b1b; }
  .ranking-num { font-weight: 700; color: #4361ee; }
  .manual-mark { color: #f59e0b; font-weight: bold; }
  .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #eee; font-size: 12px; color: #999; text-align: center; }
</style>
</head>
<body>
<div class="container">
  <h1>📊 Report Marketing ${periodLabel}</h1>
  <p class="subtitle">Ciao Mirko — periodo: ${dateRange.from} → ${dateRange.to}</p>

  <h2>🌐 Metriche Globali</h2>
  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-value">${formatCurrency(global.total_spend)}</div>
      <div class="kpi-label">Spesa Totale</div>
      ${prevGlobal ? `<div class="kpi-trend ${global.total_spend > (prevGlobal.total_spend || 0) ? "trend-up" : "trend-down"}">${trendIndicator(global.total_spend, prevGlobal.total_spend)}</div>` : ""}
    </div>
    <div class="kpi-card">
      <div class="kpi-value">${global.total_leads}</div>
      <div class="kpi-label">Lead Totali</div>
      ${prevGlobal ? `<div class="kpi-trend ${global.total_leads > (prevGlobal.total_leads || 0) ? "trend-up" : "trend-down"}">${trendIndicator(global.total_leads, prevGlobal.total_leads)}</div>` : ""}
    </div>
    <div class="kpi-card">
      <div class="kpi-value">${global.avg_cpl ? formatCurrency(global.avg_cpl) : "N/A"}</div>
      <div class="kpi-label">CPL Medio</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-value">${global.avg_ctr.toFixed(2)}%</div>
      <div class="kpi-label">CTR Medio</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-value">${global.total_conversions}</div>
      <div class="kpi-label">Conversioni</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-value">${global.total_reach.toLocaleString("it-IT")}</div>
      <div class="kpi-label">Reach Totale</div>
    </div>
  </div>`;

  // Brand ranking by CPL
  if (brandRanking.length > 0) {
    html += `
  <h2>🏆 Ranking Brand per CPL</h2>
  <table>
    <tr><th>#</th><th>Brand</th><th class="text-right">Spesa</th><th class="text-right">Lead</th><th class="text-right">CPL</th></tr>`;
    brandRanking.forEach((b, i) => {
      const cpl = b.total_spend / b.lead_count;
      html += `
    <tr${i === 0 ? ' class="highlight"' : ""}>
      <td class="ranking-num">${i + 1}</td>
      <td>${b.brand_name}</td>
      <td class="text-right">${formatCurrency(b.total_spend)}</td>
      <td class="text-right">${b.lead_count}</td>
      <td class="text-right">${formatCurrency(cpl)}</td>
    </tr>`;
    });
    html += `</table>`;
  }

  // Per-brand sections
  for (const brand of brands) {
    html += `
  <h2>📌 ${brand.brand_name}</h2>
  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-value">${formatCurrency(brand.total_spend)}</div>
      <div class="kpi-label">Spesa</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-value">${brand.lead_count}${brand.manual_lead_count > 0 ? ` <span class="manual-mark">(+${brand.manual_lead_count}*)</span>` : ""}</div>
      <div class="kpi-label">Lead</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-value">${brand.avg_ctr.toFixed(2)}%</div>
      <div class="kpi-label">CTR</div>
    </div>
  </div>`;

    if (brand.campaigns.length > 0) {
      html += `
  <h3>Campagne</h3>
  <table>
    <tr><th>Campagna</th><th class="text-right">Spesa</th><th class="text-right">Click</th><th class="text-right">Conv.</th><th class="text-right">CTR</th><th class="text-right">CPC</th></tr>`;
      for (const c of brand.campaigns) {
        html += `
    <tr>
      <td>${c.external_campaign_name || c.external_campaign_id}</td>
      <td class="text-right">${formatCurrency(c.total_spend)}</td>
      <td class="text-right">${c.total_clicks.toLocaleString("it-IT")}</td>
      <td class="text-right">${c.total_conversions}</td>
      <td class="text-right">${c.ctr.toFixed(2)}%</td>
      <td class="text-right">${formatCurrency(c.cpc)}</td>
    </tr>`;
      }
      html += `</table>`;
    }
  }

  // Best/worst campaigns
  if (bestCampaign || worstCampaign) {
    html += `<h2>🎯 Best & Worst</h2>`;
    if (bestCampaign) {
      html += `<p><span class="badge badge-best">Best CTR</span> <strong>${bestCampaign.external_campaign_name}</strong> (${bestCampaign.brand_name}) — CTR ${bestCampaign.ctr.toFixed(2)}%</p>`;
    }
    if (worstCampaign && worstCampaign !== bestCampaign) {
      html += `<p><span class="badge badge-worst">Worst CTR</span> <strong>${worstCampaign.external_campaign_name}</strong> (${worstCampaign.brand_name}) — CTR ${worstCampaign.ctr.toFixed(2)}%</p>`;
    }
  }

  html += `
  <div class="footer">
    Report generato automaticamente — ${new Date().toLocaleString("it-IT", { timeZone: "Europe/Rome" })}
  </div>
</div>
</body>
</html>`;

  return html;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: ReportParams = await req.json();
    const { period = "week", from, to, brand_ids } = body;

    const dateRange = calculateDateRange(period, from, to);

    // Calculate previous period for trend comparison
    const daysDiff =
      (new Date(dateRange.to).getTime() - new Date(dateRange.from).getTime()) / (1000 * 60 * 60 * 24) + 1;
    const prevTo = new Date(new Date(dateRange.from).getTime() - 1000 * 60 * 60 * 24);
    const prevFrom = new Date(prevTo.getTime() - (daysDiff - 1) * 1000 * 60 * 60 * 24);
    const prevRange = {
      from: prevFrom.toISOString().split("T")[0],
      to: prevTo.toISOString().split("T")[0],
    };

    // Get active brands
    let brandsQuery = supabase
      .from("brands")
      .select("id, name")
      .eq("is_system", false);

    if (brand_ids?.length) {
      brandsQuery = brandsQuery.in("id", brand_ids);
    }

    const { data: brands } = await brandsQuery;
    if (!brands?.length) {
      return new Response(
        JSON.stringify({ error: "No brands found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const brandMetrics: BrandMetrics[] = [];
    let globalSpend = 0, globalLeads = 0, globalConversions = 0, globalImpressions = 0, globalClicks = 0, globalReach = 0;
    let prevGlobalSpend = 0, prevGlobalLeads = 0, prevGlobalConversions = 0, prevGlobalImpressions = 0, prevGlobalClicks = 0, prevGlobalReach = 0;

    for (const brand of brands) {
      // Current period ad stats
      const { data: adStats } = await supabase
        .from("ad_platform_stats")
        .select("external_campaign_id, external_campaign_name, spend, impressions, clicks, reach, frequency, conversions, stat_date")
        .eq("brand_id", brand.id)
        .gte("stat_date", dateRange.from)
        .lte("stat_date", dateRange.to);

      // Previous period ad stats for trends
      const { data: prevAdStats } = await supabase
        .from("ad_platform_stats")
        .select("spend, impressions, clicks, reach, conversions")
        .eq("brand_id", brand.id)
        .gte("stat_date", prevRange.from)
        .lte("stat_date", prevRange.to);

      // Lead counts (current period)
      const { count: metaLeadCount } = await supabase
        .from("lead_events")
        .select("id", { count: "exact", head: true })
        .eq("brand_id", brand.id)
        .neq("source", "manual")
        .gte("created_at", dateRange.from)
        .lte("created_at", dateRange.to + "T23:59:59");

      const { count: manualLeadCount } = await supabase
        .from("lead_events")
        .select("id", { count: "exact", head: true })
        .eq("brand_id", brand.id)
        .eq("source", "manual")
        .gte("created_at", dateRange.from)
        .lte("created_at", dateRange.to + "T23:59:59");

      // Previous period lead counts
      const { count: prevLeadCount } = await supabase
        .from("lead_events")
        .select("id", { count: "exact", head: true })
        .eq("brand_id", brand.id)
        .gte("created_at", prevRange.from)
        .lte("created_at", prevRange.to + "T23:59:59");

      // Aggregate campaign metrics
      const campaignMap = new Map<string, CampaignMetrics>();
      let brandSpend = 0, brandImpressions = 0, brandClicks = 0, brandReach = 0, brandConversions = 0;

      for (const row of adStats || []) {
        const spend = Number(row.spend) || 0;
        const impressions = Number(row.impressions) || 0;
        const clicks = Number(row.clicks) || 0;
        const reach = Number(row.reach) || 0;
        const conversions = Number(row.conversions) || 0;

        brandSpend += spend;
        brandImpressions += impressions;
        brandClicks += clicks;
        brandReach += reach;
        brandConversions += conversions;

        const key = row.external_campaign_id;
        const existing = campaignMap.get(key);
        if (existing) {
          existing.total_spend += spend;
          existing.total_impressions += impressions;
          existing.total_clicks += clicks;
          existing.total_conversions += conversions;
        } else {
          campaignMap.set(key, {
            external_campaign_id: row.external_campaign_id,
            external_campaign_name: row.external_campaign_name || row.external_campaign_id,
            total_spend: spend,
            total_impressions: impressions,
            total_clicks: clicks,
            total_conversions: conversions,
            ctr: 0,
            cpc: 0,
          });
        }
      }

      // Calculate derived metrics per campaign
      const campaigns = Array.from(campaignMap.values()).map((c) => ({
        ...c,
        ctr: c.total_impressions > 0 ? (c.total_clicks / c.total_impressions) * 100 : 0,
        cpc: c.total_clicks > 0 ? c.total_spend / c.total_clicks : 0,
      }));

      // Previous period aggregates
      let prevBrandSpend = 0, prevBrandImpressions = 0, prevBrandClicks = 0, prevBrandReach = 0, prevBrandConversions = 0;
      for (const row of prevAdStats || []) {
        prevBrandSpend += Number(row.spend) || 0;
        prevBrandImpressions += Number(row.impressions) || 0;
        prevBrandClicks += Number(row.clicks) || 0;
        prevBrandReach += Number(row.reach) || 0;
        prevBrandConversions += Number(row.conversions) || 0;
      }

      const totalLeads = (metaLeadCount || 0) + (manualLeadCount || 0);

      brandMetrics.push({
        brand_id: brand.id,
        brand_name: brand.name,
        total_spend: brandSpend,
        total_impressions: brandImpressions,
        total_clicks: brandClicks,
        total_reach: brandReach,
        total_conversions: brandConversions,
        avg_ctr: brandImpressions > 0 ? (brandClicks / brandImpressions) * 100 : 0,
        avg_cpc: brandClicks > 0 ? brandSpend / brandClicks : 0,
        avg_cpm: brandImpressions > 0 ? (brandSpend / brandImpressions) * 1000 : 0,
        campaigns,
        lead_count: totalLeads,
        manual_lead_count: manualLeadCount || 0,
      });

      globalSpend += brandSpend;
      globalImpressions += brandImpressions;
      globalClicks += brandClicks;
      globalReach += brandReach;
      globalConversions += brandConversions;
      globalLeads += totalLeads;

      prevGlobalSpend += prevBrandSpend;
      prevGlobalImpressions += prevBrandImpressions;
      prevGlobalClicks += prevBrandClicks;
      prevGlobalReach += prevBrandReach;
      prevGlobalConversions += prevBrandConversions;
      prevGlobalLeads += (prevLeadCount || 0);
    }

    const globalMetrics: GlobalMetrics = {
      total_spend: globalSpend,
      total_leads: globalLeads,
      total_conversions: globalConversions,
      avg_cpl: globalLeads > 0 ? globalSpend / globalLeads : null,
      avg_ctr: globalImpressions > 0 ? (globalClicks / globalImpressions) * 100 : 0,
      total_reach: globalReach,
    };

    const prevGlobalMetrics: GlobalMetrics = {
      total_spend: prevGlobalSpend,
      total_leads: prevGlobalLeads,
      total_conversions: prevGlobalConversions,
      avg_cpl: prevGlobalLeads > 0 ? prevGlobalSpend / prevGlobalLeads : null,
      avg_ctr: prevGlobalImpressions > 0 ? (prevGlobalClicks / prevGlobalImpressions) * 100 : 0,
      total_reach: prevGlobalReach,
    };

    const html = generateHTML(globalMetrics, brandMetrics, dateRange, period, prevGlobalMetrics);

    return new Response(
      JSON.stringify({
        html,
        globalMetrics,
        businessManagers: brandMetrics,
        ranking: brandMetrics
          .filter((b) => b.lead_count > 0)
          .sort((a, b) => a.total_spend / a.lead_count - b.total_spend / b.lead_count)
          .map((b) => ({
            brand: b.brand_name,
            cpl: b.total_spend / b.lead_count,
            leads: b.lead_count,
          })),
        dateRange,
        type: period,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[generate-weekly-report] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
