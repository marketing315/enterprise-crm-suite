CREATE OR REPLACE FUNCTION public.get_marketing_campaign_kpis(
  p_brand_id uuid,
  p_from date,
  p_to date,
  p_channel_id uuid DEFAULT NULL,
  p_campaign_id uuid DEFAULT NULL
)
RETURNS TABLE(
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
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $function$
DECLARE
  v_is_company_brand boolean;
  v_company_brand_id uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
  IF NOT has_marketing_access(get_user_id(auth.uid()), p_brand_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  v_is_company_brand := (p_brand_id = v_company_brand_id);

  RETURN QUERY
  WITH campaign_leads AS (
    SELECT 
      mcp.id as cid,
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
  ),
  campaign_revenue AS (
    SELECT
      mcp.id as cid,
      COUNT(DISTINCT d.id) as deals_total,
      COUNT(DISTINCT d.id) FILTER (WHERE d.status = 'won') as deals_won_count,
      COALESCE(SUM(DISTINCT d.value) FILTER (WHERE d.status = 'won'), 0) as total_revenue
    FROM marketing_campaigns mcp
    JOIN lead_events le ON (
      (mcp.external_id IS NOT NULL AND le.source_name ILIKE '%' || mcp.external_id || '%')
      OR le.source_name ILIKE '%' || mcp.name || '%'
    )
    JOIN contacts c ON le.contact_id = c.id
    JOIN deals d ON d.contact_id = c.id
      AND d.closed_at >= p_from::timestamptz AND d.closed_at <= (p_to + 1)::timestamptz
    WHERE (v_is_company_brand OR mcp.brand_id = p_brand_id)
      AND (v_is_company_brand OR le.brand_id = p_brand_id)
      AND (p_channel_id IS NULL OR mcp.channel_id = p_channel_id)
      AND (p_campaign_id IS NULL OR mcp.id = p_campaign_id)
    GROUP BY mcp.id
  ),
  campaign_adv_spend AS (
    SELECT
      mcp.id as cid,
      COALESCE(SUM(aps.spend), 0) as total_spend
    FROM marketing_campaigns mcp
    JOIN ad_platform_stats aps ON (
      aps.campaign_id = mcp.id
      OR (mcp.external_id IS NOT NULL AND aps.external_campaign_id = mcp.external_id)
    )
      AND aps.stat_date >= p_from AND aps.stat_date <= p_to
      AND (v_is_company_brand OR aps.brand_id = p_brand_id)
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
    COALESCE(cr.deals_total, 0)::bigint as deals_count,
    COALESCE(cr.deals_won_count, 0)::bigint as deals_won,
    COALESCE(cr.total_revenue, 0)::numeric as revenue,
    COALESCE(cas.total_spend, 0)::numeric as marketing_cost,
    ROUND(COALESCE(cas.total_spend, 0) / NULLIF(cl.leads_total, 0), 2) as cpl,
    ROUND(COALESCE(cas.total_spend, 0) / NULLIF(cr.deals_won_count, 0), 2) as cac,
    ROUND((COALESCE(cr.total_revenue, 0) - COALESCE(cas.total_spend, 0)) / NULLIF(cas.total_spend, 0) * 100, 2) as roi
  FROM marketing_campaigns mcp
  LEFT JOIN marketing_channels ch ON ch.id = mcp.channel_id
  LEFT JOIN campaign_leads cl ON cl.cid = mcp.id
  LEFT JOIN campaign_revenue cr ON cr.cid = mcp.id
  LEFT JOIN campaign_adv_spend cas ON cas.cid = mcp.id
  WHERE (v_is_company_brand OR mcp.brand_id = p_brand_id)
    AND (p_channel_id IS NULL OR mcp.channel_id = p_channel_id)
    AND (p_campaign_id IS NULL OR mcp.id = p_campaign_id)
  ORDER BY COALESCE(cr.total_revenue, 0) DESC;
END;
$function$;