import { type SupabaseClient, applyBrandFilter, getPeriodDates } from "./helpers.ts";

// ── TOOL HANDLERS ──

export async function handleToolCall(
  supabase: SupabaseClient,
  brandId: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (toolName) {
    case "dynamic_analytics_query":
      return await executeDynamicQuery(supabase, brandId, args);
    case "search_contacts":
      return await searchContacts(supabase, brandId, args.query as string, (args.limit as number) || 5);
    case "get_contact_timeline":
      return await getContactTimeline(supabase, brandId, args.contact_id as string);
    case "get_pipeline_status":
      return await getPipelineStatus(supabase, brandId);
    case "get_operator_performance":
      return await getOperatorPerformance(supabase, brandId, (args.period as string) || "7d");
    case "get_ad_performance":
      return await getAdPerformance(supabase, brandId, args);
    case "get_raw_table_data":
      return await getRawTableData(supabase, brandId, args);
    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

async function executeDynamicQuery(supabase: SupabaseClient, brandId: string, args: Record<string, unknown>) {
  try {
    const { data, error } = await supabase.rpc("dynamic_analytics_query", {
      p_brand_id: brandId,
      p_dataset: args.dataset as string,
      p_metric: (args.metric as string) || "count",
      p_date_from: (args.date_from as string) || null,
      p_date_to: (args.date_to as string) || null,
      p_group_by: (args.group_by as string) || null,
      p_filters: args.filters || {},
      p_limit: (args.limit as number) || 50,
    });
    if (error) {
      console.error("[dynamic_analytics_query] RPC error:", error.message);
      return { error: error.message, hint: "Verifica che dataset, metric, group_by e filters siano validi." };
    }
    return {
      dataset: args.dataset, metric: args.metric || "count", group_by: args.group_by || null,
      date_from: args.date_from || null, date_to: args.date_to || null, filters: args.filters || {},
      results: data, row_count: Array.isArray(data) ? data.length : 0,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[dynamic_analytics_query] Exception:", msg);
    return { error: msg };
  }
}

async function searchContacts(supabase: SupabaseClient, brandId: string, query: string, limit: number) {
  const sanitized = query.replace(/[%_\\'"(),.*]/g, '').trim();
  if (!sanitized) return { contacts: [], count: 0 };
  let q = supabase
    .from("contacts")
    .select("id, first_name, last_name, email, phone, city, cap, province, company_name, lead_type, status, created_at");
  q = applyBrandFilter(q, brandId);
  q = q.or(`first_name.ilike.%${sanitized}%,last_name.ilike.%${sanitized}%,email.ilike.%${sanitized}%,phone.ilike.%${sanitized}%,company_name.ilike.%${sanitized}%`)
    .limit(limit);
  const { data } = await q;
  return { contacts: data || [], count: (data || []).length };
}

async function getContactTimeline(supabase: SupabaseClient, brandId: string, contactId: string) {
  const buildQ = (table: string, select: string, contactField: string, orderField: string) => {
    let q = supabase.from(table).select(select);
    q = applyBrandFilter(q, brandId);
    return q.eq(contactField, contactId).order(orderField, { ascending: false }).limit(10);
  };
  const [leads, deals, tickets, appointments, calls] = await Promise.all([
    buildQ("lead_events", "id, source_name, lead_type, received_at", "contact_id", "received_at"),
    buildQ("deals", "id, value, status, created_at", "contact_id", "created_at"),
    buildQ("tickets", "id, status, priority, created_at", "contact_id", "created_at"),
    buildQ("appointments", "id, status, scheduled_at, appointment_type", "contact_id", "scheduled_at"),
    buildQ("call_logs", "id, status, outcome, started_at, duration_seconds", "contact_id", "started_at"),
  ]);
  return {
    leads: leads.data || [], deals: deals.data || [], tickets: tickets.data || [],
    appointments: appointments.data || [], calls: calls.data || [],
  };
}

async function getPipelineStatus(supabase: SupabaseClient, brandId: string) {
  let dealsQ = supabase.from("deals").select("id, value, status, current_stage_id, created_at, contact:contacts(first_name, last_name)");
  dealsQ = applyBrandFilter(dealsQ, brandId);
  dealsQ = dealsQ.eq("status", "open").order("created_at", { ascending: true });
  let stagesQ = supabase.from("pipeline_stages").select("id, name, sort_order");
  stagesQ = applyBrandFilter(stagesQ, brandId);
  stagesQ = stagesQ.order("sort_order");
  const [dealsResult, stagesResult] = await Promise.all([dealsQ, stagesQ]);
  interface Deal { id: string; value: number | null; current_stage_id: string | null; created_at: string; contact: { first_name: string | null; last_name: string | null } | null }
  interface Stage { id: string; name: string; sort_order: number }
  const deals = (dealsResult.data || []) as Deal[];
  const stages = (stagesResult.data || []) as Stage[];
  const dealsByStage = stages.map((stage) => {
    const stageDeals = deals.filter((d) => d.current_stage_id === stage.id);
    return { stage_name: stage.name, count: stageDeals.length, value: stageDeals.reduce((sum, d) => sum + (d.value || 0), 0) };
  });
  return {
    total_open_deals: deals.length,
    total_value: deals.reduce((sum, d) => sum + (d.value || 0), 0),
    deals_by_stage: dealsByStage,
    oldest_deals: deals.slice(0, 3).map((d) => ({
      contact_name: d.contact ? `${d.contact.first_name || ""} ${d.contact.last_name || ""}`.trim() : "N/D",
      value: d.value,
      days_open: Math.floor((Date.now() - new Date(d.created_at).getTime()) / 86400000),
    })),
  };
}

async function getOperatorPerformance(supabase: SupabaseClient, brandId: string, period: string) {
  const { from } = getPeriodDates(period);
  let ticketQ = supabase
    .from("tickets")
    .select("id, assigned_user_id, status, resolved_at, created_at, first_response_at, assignee:users!tickets_assigned_user_id_fkey(full_name)");
  ticketQ = applyBrandFilter(ticketQ, brandId);
  ticketQ = ticketQ.gte("created_at", from);
  const { data: ticketsData } = await ticketQ;
  interface T { assigned_user_id: string | null; status: string; resolved_at: string | null; created_at: string; first_response_at: string | null; assignee: { full_name: string | null } | null }
  const tickets = (ticketsData || []) as T[];
  const stats: Record<string, { name: string; assigned: number; resolved: number; responseMs: number[] }> = {};
  tickets.forEach((t) => {
    if (!t.assigned_user_id) return;
    if (!stats[t.assigned_user_id]) stats[t.assigned_user_id] = { name: t.assignee?.full_name || "N/D", assigned: 0, resolved: 0, responseMs: [] };
    stats[t.assigned_user_id].assigned++;
    if (t.resolved_at) stats[t.assigned_user_id].resolved++;
    if (t.first_response_at && t.created_at) stats[t.assigned_user_id].responseMs.push(new Date(t.first_response_at).getTime() - new Date(t.created_at).getTime());
  });
  return {
    period,
    operators: Object.entries(stats).map(([id, s]) => ({
      operator_id: id, name: s.name, assigned: s.assigned, resolved: s.resolved,
      resolution_rate: s.assigned > 0 ? Math.round((s.resolved / s.assigned) * 100) : 0,
      avg_response_hours: s.responseMs.length > 0 ? Math.round((s.responseMs.reduce((a, b) => a + b, 0) / s.responseMs.length / 3600000) * 10) / 10 : null,
    })).sort((a, b) => b.resolved - a.resolved),
  };
}

async function getAdPerformance(supabase: SupabaseClient, brandId: string, args: Record<string, unknown>) {
  try {
    const now = new Date();
    const dateFrom = (args.date_from as string) || new Date(now.getTime() - 30 * 86400000).toISOString().split('T')[0];
    const dateTo = (args.date_to as string) || now.toISOString().split('T')[0];
    const platform = (args.platform as string) || null;
    const includeCreatives = (args.include_creatives as boolean) || false;
    const includeDemographics = (args.include_demographics as boolean) || false;

    let campaignQuery = supabase
      .from("ad_platform_stats")
      .select("external_campaign_id, external_campaign_name, platform, spend, impressions, clicks, reach, frequency, conversions, conversions_value, stat_date, brand_id");
    campaignQuery = applyBrandFilter(campaignQuery, brandId);
    campaignQuery = campaignQuery.gte("stat_date", dateFrom).lte("stat_date", dateTo);
    if (platform) campaignQuery = campaignQuery.eq("platform", platform);

    const { data: campaignData, error: campaignError } = await campaignQuery;
    if (campaignError) return { error: campaignError.message };

    interface CampaignAgg { name: string; platform: string; spend: number; impressions: number; clicks: number; reach: number; conversions: number; conversions_value: number; days: Set<string> }
    const campaignMap: Record<string, CampaignAgg> = {};
    let totalSpend = 0, totalImpressions = 0, totalClicks = 0, totalReach = 0, totalConversions = 0, totalConversionsValue = 0;

    for (const row of (campaignData || [])) {
      const key = `${row.external_campaign_id}_${row.platform}`;
      if (!campaignMap[key]) campaignMap[key] = { name: row.external_campaign_name || row.external_campaign_id, platform: row.platform, spend: 0, impressions: 0, clicks: 0, reach: 0, conversions: 0, conversions_value: 0, days: new Set() };
      const c = campaignMap[key];
      c.spend += row.spend || 0; c.impressions += row.impressions || 0; c.clicks += row.clicks || 0;
      c.reach += row.reach || 0; c.conversions += row.conversions || 0; c.conversions_value += row.conversions_value || 0;
      c.days.add(row.stat_date);
      totalSpend += row.spend || 0; totalImpressions += row.impressions || 0; totalClicks += row.clicks || 0;
      totalReach += row.reach || 0; totalConversions += row.conversions || 0; totalConversionsValue += row.conversions_value || 0;
    }

    const campaigns = Object.entries(campaignMap).map(([id, c]) => ({
      campaign_id: id.split('_')[0], campaign_name: c.name, platform: c.platform,
      spend: Math.round(c.spend * 100) / 100, impressions: c.impressions, clicks: c.clicks, reach: c.reach,
      conversions: c.conversions, conversions_value: Math.round(c.conversions_value * 100) / 100,
      ctr: c.impressions > 0 ? Math.round((c.clicks / c.impressions) * 10000) / 100 : 0,
      cpc: c.clicks > 0 ? Math.round((c.spend / c.clicks) * 100) / 100 : 0,
      cpm: c.impressions > 0 ? Math.round((c.spend / c.impressions * 1000) * 100) / 100 : 0,
      days_active: c.days.size,
    })).sort((a, b) => b.spend - a.spend);

    const result: Record<string, unknown> = {
      period: { from: dateFrom, to: dateTo },
      summary: {
        total_spend: Math.round(totalSpend * 100) / 100, total_impressions: totalImpressions,
        total_clicks: totalClicks, total_reach: totalReach, total_conversions: totalConversions,
        total_conversions_value: Math.round(totalConversionsValue * 100) / 100,
        avg_ctr: totalImpressions > 0 ? Math.round((totalClicks / totalImpressions) * 10000) / 100 : 0,
        avg_cpc: totalClicks > 0 ? Math.round((totalSpend / totalClicks) * 100) / 100 : 0,
        avg_cpm: totalImpressions > 0 ? Math.round((totalSpend / totalImpressions * 1000) * 100) / 100 : 0,
        campaigns_count: campaigns.length,
      },
      campaigns,
    };

    if (includeCreatives) {
      let creativeQuery = supabase.from("ad_creative_stats")
        .select("external_ad_id, external_ad_name, external_campaign_id, external_campaign_name, platform, spend, impressions, clicks, reach, thumbnail_url, stat_date");
      creativeQuery = applyBrandFilter(creativeQuery, brandId);
      creativeQuery = creativeQuery.gte("stat_date", dateFrom).lte("stat_date", dateTo);
      if (platform) creativeQuery = creativeQuery.eq("platform", platform);
      const { data: creativeData } = await creativeQuery;
      interface CreativeAgg { name: string; campaign: string; platform: string; spend: number; impressions: number; clicks: number; reach: number; thumbnail: string | null }
      const creativeMap: Record<string, CreativeAgg> = {};
      for (const row of (creativeData || [])) {
        const key = row.external_ad_id;
        if (!creativeMap[key]) creativeMap[key] = { name: row.external_ad_name || row.external_ad_id, campaign: row.external_campaign_name || '', platform: row.platform, spend: 0, impressions: 0, clicks: 0, reach: 0, thumbnail: row.thumbnail_url };
        creativeMap[key].spend += row.spend || 0; creativeMap[key].impressions += row.impressions || 0;
        creativeMap[key].clicks += row.clicks || 0; creativeMap[key].reach += row.reach || 0;
      }
      result.creatives = Object.entries(creativeMap).map(([id, c]) => ({
        ad_id: id, ad_name: c.name, campaign: c.campaign, platform: c.platform,
        spend: Math.round(c.spend * 100) / 100, impressions: c.impressions, clicks: c.clicks, reach: c.reach,
        ctr: c.impressions > 0 ? Math.round((c.clicks / c.impressions) * 10000) / 100 : 0,
        cpc: c.clicks > 0 ? Math.round((c.spend / c.clicks) * 100) / 100 : 0,
      })).sort((a, b) => b.spend - a.spend).slice(0, 20);
    }

    if (includeDemographics) {
      let demoQuery = supabase.from("ad_demographic_stats")
        .select("age_range, gender, spend, impressions, clicks, reach, stat_date");
      demoQuery = applyBrandFilter(demoQuery, brandId);
      demoQuery = demoQuery.gte("stat_date", dateFrom).lte("stat_date", dateTo);
      if (platform) demoQuery = demoQuery.eq("platform", platform);
      const { data: demoData } = await demoQuery;
      interface DemoAgg { spend: number; impressions: number; clicks: number; reach: number }
      const demoMap: Record<string, DemoAgg> = {};
      for (const row of (demoData || [])) {
        const key = `${row.age_range}|${row.gender}`;
        if (!demoMap[key]) demoMap[key] = { spend: 0, impressions: 0, clicks: 0, reach: 0 };
        demoMap[key].spend += row.spend || 0; demoMap[key].impressions += row.impressions || 0;
        demoMap[key].clicks += row.clicks || 0; demoMap[key].reach += row.reach || 0;
      }
      result.demographics = Object.entries(demoMap).map(([key, d]) => {
        const [age, gender] = key.split('|');
        return {
          age_range: age, gender,
          spend: Math.round(d.spend * 100) / 100, impressions: d.impressions, clicks: d.clicks, reach: d.reach,
          ctr: d.impressions > 0 ? Math.round((d.clicks / d.impressions) * 10000) / 100 : 0,
          cpc: d.clicks > 0 ? Math.round((d.spend / d.clicks) * 100) / 100 : 0,
        };
      }).sort((a, b) => b.spend - a.spend);
    }

    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[get_ad_performance] Exception:", msg);
    return { error: msg };
  }
}

const RAW_TABLE_WHITELIST: Record<string, { defaultColumns: string; defaultOrder: string }> = {
  expenses: { defaultColumns: "id,amount,gross_amount,expense_date,vendor_name,description,periodicity,is_deductible,created_at", defaultOrder: "expense_date" },
  budgets: { defaultColumns: "id,category_id,period_month,planned_amount,notes,created_at", defaultOrder: "period_month" },
  sales_orders: { defaultColumns: "id,order_number,status,subtotal,discount_amount,tax_amount,total_amount,paid_amount,notes,created_at,confirmed_at,paid_at", defaultOrder: "created_at" },
  products: { defaultColumns: "id,name,description,sku,default_price,vat_rate,is_active,created_at", defaultOrder: "created_at" },
  marketing_campaigns: { defaultColumns: "id,name,external_id,start_date,end_date,planned_budget,status,created_at", defaultOrder: "created_at" },
  automation_rules: { defaultColumns: "id,name,description,trigger_type,action_type,is_active,execution_count,last_executed_at,created_at", defaultOrder: "created_at" },
  automation_logs: { defaultColumns: "id,action_taken,entity_type,entity_id,status,error_message,duration_ms,created_at", defaultOrder: "created_at" },
  deal_stage_transitions: { defaultColumns: "id,deal_id,from_stage_label,to_stage_label,actor_display_name,occurred_at", defaultOrder: "occurred_at" },
  pipeline_stages: { defaultColumns: "id,name,sort_order,is_active,created_at", defaultOrder: "sort_order" },
  expense_categories: { defaultColumns: "id,name,category_type,is_deductible,is_active,created_at", defaultOrder: "name" },
  cost_centers: { defaultColumns: "id,name,code,is_active,created_at", defaultOrder: "name" },
  ad_platform_stats: { defaultColumns: "id,external_campaign_name,platform,spend,impressions,clicks,reach,conversions,stat_date", defaultOrder: "stat_date" },
  ad_creative_stats: { defaultColumns: "id,external_ad_name,external_campaign_name,platform,spend,impressions,clicks,stat_date", defaultOrder: "stat_date" },
  ad_demographic_stats: { defaultColumns: "id,age_range,gender,platform,spend,impressions,clicks,reach,stat_date", defaultOrder: "stat_date" },
  webhook_sources: { defaultColumns: "id,name,description,is_active,rate_limit_per_min,created_at", defaultOrder: "created_at" },
  admin_notes: { defaultColumns: "id,type,ref_table,ref_id,content,created_at", defaultOrder: "created_at" },
  admin_todos: { defaultColumns: "id,title,completed,display_order,created_at", defaultOrder: "display_order" },
  brand_tax_settings: { defaultColumns: "id,corporate_tax_rate,regional_tax_rate,vat_rate_default,fiscal_year_start,notes,updated_at", defaultOrder: "updated_at" },
  deals: { defaultColumns: "id,contact_id,current_stage_id,status,value,notes,assigned_user_id,created_at,closed_at", defaultOrder: "created_at" },
  tickets: { defaultColumns: "id,contact_id,status,priority,subject,assigned_user_id,created_at,resolved_at", defaultOrder: "created_at" },
  appointments: { defaultColumns: "id,contact_id,scheduled_at,status,appointment_type,address,city,notes,assigned_sales_user_id", defaultOrder: "scheduled_at" },
  call_logs: { defaultColumns: "id,contact_id,phone_number,call_type,status,outcome,duration_seconds,started_at,notes", defaultOrder: "started_at" },
  contacts: { defaultColumns: "id,first_name,last_name,email,city,cap,province,company_name,status,lead_type,created_at", defaultOrder: "created_at" },
  lead_events: { defaultColumns: "id,contact_id,source,source_name,lead_type,ai_priority,received_at", defaultOrder: "received_at" },
};

async function getRawTableData(supabase: SupabaseClient, brandId: string, args: Record<string, unknown>) {
  try {
    const tableName = args.table as string;
    const config = RAW_TABLE_WHITELIST[tableName];
    if (!config) return { error: `Tabella non consentita: ${tableName}` };

    const columns = (args.columns as string) || config.defaultColumns;
    const orderBy = (args.order_by as string) || config.defaultOrder;
    const ascending = (args.ascending as boolean) ?? false;
    const limit = Math.min((args.limit as number) || 20, 50);

    let query = supabase.from(tableName).select(columns);
    query = applyBrandFilter(query, brandId);

    const filters = (args.filters as Record<string, unknown>) || {};
    for (const [key, val] of Object.entries(filters)) {
      if (Array.isArray(val)) query = query.in(key, val);
      else if (typeof val === 'boolean') query = query.eq(key, val);
      else query = query.eq(key, String(val));
    }

    query = query.order(orderBy, { ascending }).limit(limit);
    const { data, error } = await query;

    if (error) return { error: error.message };
    return { table: tableName, rows: data || [], row_count: (data || []).length, columns, order_by: orderBy };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { error: msg };
  }
}
