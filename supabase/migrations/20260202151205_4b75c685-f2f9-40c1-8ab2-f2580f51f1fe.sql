-- Fix division by zero: return NULL instead of 0 for CPL/CAC/ROI when denominator is 0

-- Update get_marketing_campaign_kpis
CREATE OR REPLACE FUNCTION public.get_marketing_campaign_kpis(
  p_brand_id uuid,
  p_from date,
  p_to date,
  p_channel_id uuid DEFAULT NULL,
  p_campaign_id uuid DEFAULT NULL
)
RETURNS TABLE (
  campaign_id uuid,
  campaign_name text,
  channel_name text,
  leads_count bigint,
  deals_count bigint,
  deals_won bigint,
  revenue numeric,
  marketing_cost numeric,
  cpl numeric,
  cac numeric,
  roi numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_company_brand boolean;
  v_company_brand_id uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
  IF NOT has_marketing_access(get_user_id(auth.uid()), p_brand_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  v_is_company_brand := (p_brand_id = v_company_brand_id);

  RETURN QUERY
  WITH campaign_costs AS (
    SELECT 
      mc.campaign_id,
      COALESCE(SUM(mc.amount), 0) as total_cost
    FROM marketing_costs mc
    WHERE mc.cost_date >= p_from AND mc.cost_date <= p_to
      AND (v_is_company_brand OR mc.brand_id = p_brand_id)
      AND (p_campaign_id IS NULL OR mc.campaign_id = p_campaign_id)
    GROUP BY mc.campaign_id
  ),
  campaign_deals AS (
    SELECT 
      d.marketing_campaign_id,
      COUNT(*) as deals_total,
      COUNT(*) FILTER (WHERE d.status = 'won') as deals_won_count,
      COALESCE(SUM(d.value) FILTER (WHERE d.status = 'won'), 0) as total_revenue
    FROM deals d
    WHERE d.created_at >= p_from::timestamptz AND d.created_at <= (p_to + 1)::timestamptz
      AND d.marketing_campaign_id IS NOT NULL
      AND (v_is_company_brand OR d.brand_id = p_brand_id)
      AND (p_campaign_id IS NULL OR d.marketing_campaign_id = p_campaign_id)
    GROUP BY d.marketing_campaign_id
  ),
  campaign_leads AS (
    SELECT 
      mcp.id as campaign_id,
      COUNT(DISTINCT le.id) as leads_total
    FROM marketing_campaigns mcp
    LEFT JOIN lead_events le ON (
      (mcp.external_id IS NOT NULL AND le.source_name ILIKE '%' || mcp.external_id || '%')
      OR le.source_name ILIKE '%' || mcp.name || '%'
    )
      AND le.received_at >= p_from::timestamptz AND le.received_at <= (p_to + 1)::timestamptz
      AND (v_is_company_brand OR le.brand_id = p_brand_id)
    WHERE (v_is_company_brand OR mcp.brand_id = p_brand_id)
      AND (p_channel_id IS NULL OR mcp.channel_id = p_channel_id)
      AND (p_campaign_id IS NULL OR mcp.id = p_campaign_id)
    GROUP BY mcp.id
  )
  SELECT 
    mcp.id as campaign_id,
    mcp.name as campaign_name,
    COALESCE(ch.name, 'Non specificato') as channel_name,
    COALESCE(cl.leads_total, 0)::bigint as leads_count,
    COALESCE(cd.deals_total, 0)::bigint as deals_count,
    COALESCE(cd.deals_won_count, 0)::bigint as deals_won,
    COALESCE(cd.total_revenue, 0)::numeric as revenue,
    COALESCE(cc.total_cost, 0)::numeric as marketing_cost,
    -- CPL: NULL if no leads
    ROUND(COALESCE(cc.total_cost, 0) / NULLIF(cl.leads_total, 0), 2) as cpl,
    -- CAC: NULL if no won deals
    ROUND(COALESCE(cc.total_cost, 0) / NULLIF(cd.deals_won_count, 0), 2) as cac,
    -- ROI: NULL if no cost
    ROUND((COALESCE(cd.total_revenue, 0) - COALESCE(cc.total_cost, 0)) / NULLIF(cc.total_cost, 0) * 100, 2) as roi
  FROM marketing_campaigns mcp
  LEFT JOIN marketing_channels ch ON ch.id = mcp.channel_id
  LEFT JOIN campaign_costs cc ON cc.campaign_id = mcp.id
  LEFT JOIN campaign_deals cd ON cd.marketing_campaign_id = mcp.id
  LEFT JOIN campaign_leads cl ON cl.campaign_id = mcp.id
  WHERE (v_is_company_brand OR mcp.brand_id = p_brand_id)
    AND (p_channel_id IS NULL OR mcp.channel_id = p_channel_id)
    AND (p_campaign_id IS NULL OR mcp.id = p_campaign_id)
  ORDER BY COALESCE(cd.total_revenue, 0) DESC;
END;
$$;

-- Update get_marketing_summary_kpis
CREATE OR REPLACE FUNCTION public.get_marketing_summary_kpis(
  p_brand_id uuid,
  p_from date,
  p_to date
)
RETURNS TABLE (
  total_leads bigint,
  total_deals bigint,
  total_deals_won bigint,
  total_revenue numeric,
  total_marketing_cost numeric,
  avg_cpl numeric,
  avg_cac numeric,
  overall_roi numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_company_brand boolean;
  v_company_brand_id uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
  IF NOT has_marketing_access(get_user_id(auth.uid()), p_brand_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  v_is_company_brand := (p_brand_id = v_company_brand_id);

  RETURN QUERY
  WITH aggregated AS (
    SELECT
      SUM(kpi.leads_count) as total_leads,
      SUM(kpi.deals_count) as total_deals,
      SUM(kpi.deals_won) as total_deals_won,
      SUM(kpi.revenue) as total_revenue,
      SUM(kpi.marketing_cost) as total_cost
    FROM get_marketing_campaign_kpis(p_brand_id, p_from, p_to, NULL, NULL) kpi
  )
  SELECT
    COALESCE(a.total_leads, 0)::bigint,
    COALESCE(a.total_deals, 0)::bigint,
    COALESCE(a.total_deals_won, 0)::bigint,
    COALESCE(a.total_revenue, 0)::numeric,
    COALESCE(a.total_cost, 0)::numeric,
    -- avg_cpl: NULL if no leads
    ROUND(COALESCE(a.total_cost, 0) / NULLIF(a.total_leads, 0), 2) as avg_cpl,
    -- avg_cac: NULL if no won deals
    ROUND(COALESCE(a.total_cost, 0) / NULLIF(a.total_deals_won, 0), 2) as avg_cac,
    -- overall_roi: NULL if no cost
    ROUND((COALESCE(a.total_revenue, 0) - COALESCE(a.total_cost, 0)) / NULLIF(a.total_cost, 0) * 100, 2) as overall_roi
  FROM aggregated a;
END;
$$;

-- Update get_marketing_channel_kpis
CREATE OR REPLACE FUNCTION public.get_marketing_channel_kpis(
  p_brand_id uuid,
  p_from date,
  p_to date
)
RETURNS TABLE (
  channel_id uuid,
  channel_name text,
  channel_type text,
  campaigns_count bigint,
  leads_count bigint,
  deals_won bigint,
  revenue numeric,
  marketing_cost numeric,
  avg_roi numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_company_brand boolean;
  v_company_brand_id uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
  IF NOT has_marketing_access(get_user_id(auth.uid()), p_brand_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  v_is_company_brand := (p_brand_id = v_company_brand_id);

  RETURN QUERY
  WITH channel_leads AS (
    SELECT 
      mcp.channel_id,
      COUNT(DISTINCT le.id) as leads_total
    FROM marketing_campaigns mcp
    LEFT JOIN lead_events le ON (
      (mcp.external_id IS NOT NULL AND le.source_name ILIKE '%' || mcp.external_id || '%')
      OR le.source_name ILIKE '%' || mcp.name || '%'
    )
      AND le.received_at >= p_from::timestamptz AND le.received_at <= (p_to + 1)::timestamptz
      AND (v_is_company_brand OR le.brand_id = p_brand_id)
    WHERE (v_is_company_brand OR mcp.brand_id = p_brand_id)
      AND mcp.channel_id IS NOT NULL
    GROUP BY mcp.channel_id
  )
  SELECT 
    ch.id as channel_id,
    ch.name as channel_name,
    ch.type as channel_type,
    COUNT(DISTINCT mcp.id)::bigint as campaigns_count,
    COALESCE(cl.leads_total, 0)::bigint as leads_count,
    COUNT(DISTINCT d.id) FILTER (WHERE d.status = 'won')::bigint as deals_won,
    COALESCE(SUM(d.value) FILTER (WHERE d.status = 'won'), 0)::numeric as revenue,
    COALESCE(SUM(mc.amount), 0)::numeric as marketing_cost,
    -- avg_roi: NULL if no cost
    ROUND(
      (COALESCE(SUM(d.value) FILTER (WHERE d.status = 'won'), 0) - COALESCE(SUM(mc.amount), 0)) 
      / NULLIF(SUM(mc.amount), 0) * 100, 
      2
    ) as avg_roi
  FROM marketing_channels ch
  LEFT JOIN marketing_campaigns mcp ON mcp.channel_id = ch.id
    AND (v_is_company_brand OR mcp.brand_id = p_brand_id)
  LEFT JOIN deals d ON d.marketing_campaign_id = mcp.id
    AND d.created_at >= p_from::timestamptz AND d.created_at <= (p_to + 1)::timestamptz
  LEFT JOIN marketing_costs mc ON mc.campaign_id = mcp.id
    AND mc.cost_date >= p_from AND mc.cost_date <= p_to
  LEFT JOIN channel_leads cl ON cl.channel_id = ch.id
  WHERE (v_is_company_brand OR ch.brand_id = p_brand_id)
    AND ch.is_active = true
  GROUP BY ch.id, ch.name, ch.type, cl.leads_total
  ORDER BY revenue DESC;
END;
$$;