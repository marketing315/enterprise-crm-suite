
CREATE OR REPLACE FUNCTION public.get_marketing_channel_kpis(p_brand_id uuid, p_from date, p_to date)
 RETURNS TABLE(channel_id uuid, channel_name text, channel_type text, campaigns_count bigint, leads_count bigint, deals_won bigint, revenue numeric, marketing_cost numeric, avg_roi numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
  WITH channel_adv_spend AS (
    SELECT
      ch.id as channel_id,
      COALESCE(SUM(aps.spend), 0) as total_spend
    FROM marketing_channels ch
    JOIN ad_platform_stats aps ON aps.platform::text = ch.platform::text
      AND aps.stat_date >= p_from AND aps.stat_date <= p_to
      AND (v_is_company_brand OR aps.brand_id = p_brand_id)
    WHERE (v_is_company_brand OR ch.brand_id = p_brand_id)
      AND ch.is_active = true
      AND ch.platform IS NOT NULL
    GROUP BY ch.id
    HAVING SUM(aps.spend) > 0
  ),
  active_channels AS (
    SELECT cas.channel_id FROM channel_adv_spend cas
  ),
  channel_leads AS (
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
      AND mcp.channel_id IN (SELECT ac.channel_id FROM active_channels ac)
    GROUP BY mcp.channel_id
  ),
  channel_revenue AS (
    SELECT
      ch.id as channel_id,
      COUNT(DISTINCT d.id) FILTER (WHERE d.status = 'won') as deals_won_count,
      COALESCE(SUM(DISTINCT d.value) FILTER (WHERE d.status = 'won'), 0) as total_revenue
    FROM marketing_channels ch
    JOIN lead_events le ON (
      le.source_name ILIKE '%' || ch.name || '%'
      OR le.source_name ILIKE '%' || REPLACE(ch.name, ' Ads', '') || '%'
    )
    JOIN contacts c ON le.contact_id = c.id
    JOIN deals d ON d.contact_id = c.id
      AND d.closed_at >= p_from::timestamptz AND d.closed_at <= (p_to + 1)::timestamptz
    WHERE (v_is_company_brand OR ch.brand_id = p_brand_id)
      AND (v_is_company_brand OR le.brand_id = p_brand_id)
      AND ch.id IN (SELECT ac.channel_id FROM active_channels ac)
    GROUP BY ch.id
  )
  SELECT 
    ch.id as channel_id,
    ch.name as channel_name,
    ch.type as channel_type,
    COUNT(DISTINCT mcp.id)::bigint as campaigns_count,
    COALESCE(cl.leads_total, 0)::bigint as leads_count,
    COALESCE(cr.deals_won_count, 0)::bigint as deals_won,
    COALESCE(cr.total_revenue, 0)::numeric as revenue,
    COALESCE(cas.total_spend, 0)::numeric as marketing_cost,
    ROUND(
      (COALESCE(cr.total_revenue, 0) - COALESCE(cas.total_spend, 0)) 
      / NULLIF(cas.total_spend, 0) * 100, 
      2
    ) as avg_roi
  FROM marketing_channels ch
  INNER JOIN channel_adv_spend cas ON cas.channel_id = ch.id
  LEFT JOIN marketing_campaigns mcp ON mcp.channel_id = ch.id
    AND (v_is_company_brand OR mcp.brand_id = p_brand_id)
  LEFT JOIN channel_leads cl ON cl.channel_id = ch.id
  LEFT JOIN channel_revenue cr ON cr.channel_id = ch.id
  WHERE ch.is_active = true
  GROUP BY ch.id, ch.name, ch.type, cl.leads_total, cr.deals_won_count, cr.total_revenue, cas.total_spend
  ORDER BY COALESCE(cr.total_revenue, 0) DESC;
END;
$function$;
