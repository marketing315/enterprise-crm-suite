-- Fix overview KPI aggregation for "Azienda Intera"
-- 1) get_ad_platform_stats_summary: support company-wide brand id
-- 2) get_marketing_summary_kpis: aggregate from channel KPIs (already company-aware)

CREATE OR REPLACE FUNCTION public.get_ad_platform_stats_summary(
  p_brand_id uuid,
  p_from date,
  p_to date,
  p_platform text DEFAULT NULL::text,
  p_campaign_id text DEFAULT NULL::text
)
RETURNS TABLE(
  total_spend numeric,
  total_impressions bigint,
  total_clicks bigint,
  total_conversions bigint,
  total_reach bigint,
  total_leads bigint,
  avg_cpl numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_company_brand_id uuid := '00000000-0000-0000-0000-000000000000';
  v_is_company_brand boolean;
BEGIN
  IF NOT has_marketing_access(get_user_id(auth.uid()), p_brand_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  v_is_company_brand := (p_brand_id = v_company_brand_id);

  RETURN QUERY
  WITH ad_data AS (
    SELECT
      COALESCE(SUM(aps.spend), 0)::numeric AS total_spend,
      COALESCE(SUM(aps.impressions), 0)::bigint AS total_impressions,
      COALESCE(SUM(aps.clicks), 0)::bigint AS total_clicks,
      COALESCE(SUM(aps.conversions), 0)::bigint AS total_conversions,
      COALESCE(SUM(aps.reach), 0)::bigint AS total_reach
    FROM ad_platform_stats aps
    WHERE (v_is_company_brand OR aps.brand_id = p_brand_id)
      AND aps.stat_date BETWEEN p_from AND p_to
      AND (p_platform IS NULL OR aps.platform::text = p_platform)
      AND (p_campaign_id IS NULL OR aps.campaign_id::text = p_campaign_id)
  ),
  lead_data AS (
    SELECT COUNT(DISTINCT le.contact_id)::bigint AS total_leads
    FROM lead_events le
    WHERE (v_is_company_brand OR le.brand_id = p_brand_id)
      AND le.received_at >= p_from::timestamptz
      AND le.received_at < (p_to + 1)::timestamptz
      AND le.contact_id IS NOT NULL
      AND (le.archived = false OR le.archived IS NULL)
  )
  SELECT
    ad_data.total_spend,
    ad_data.total_impressions,
    ad_data.total_clicks,
    ad_data.total_conversions,
    ad_data.total_reach,
    lead_data.total_leads,
    CASE WHEN lead_data.total_leads > 0 AND ad_data.total_spend > 0
         THEN ROUND(ad_data.total_spend / lead_data.total_leads, 2)
         ELSE NULL
    END AS avg_cpl
  FROM ad_data, lead_data;
END;
$function$;


CREATE OR REPLACE FUNCTION public.get_marketing_summary_kpis(
  p_brand_id uuid,
  p_from date,
  p_to date
)
RETURNS TABLE(
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
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT has_marketing_access(get_user_id(auth.uid()), p_brand_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  WITH channel_agg AS (
    SELECT
      COALESCE(SUM(ch.leads_count), 0)::bigint AS total_leads,
      COALESCE(SUM(ch.deals_won), 0)::bigint AS total_deals_won,
      COALESCE(SUM(ch.revenue), 0)::numeric AS total_revenue,
      COALESCE(SUM(ch.marketing_cost), 0)::numeric AS total_cost
    FROM get_marketing_channel_kpis(p_brand_id, p_from, p_to) ch
  ),
  deal_count AS (
    SELECT COUNT(DISTINCT d.id)::bigint AS total_deals
    FROM deals d
    WHERE d.created_at >= p_from::timestamptz
      AND d.created_at < (p_to + 1)::timestamptz
      AND (
        p_brand_id = '00000000-0000-0000-0000-000000000000'
        OR d.brand_id = p_brand_id
      )
  )
  SELECT
    ca.total_leads,
    dc.total_deals,
    ca.total_deals_won,
    ca.total_revenue,
    ca.total_cost,
    ROUND(ca.total_cost / NULLIF(ca.total_leads, 0), 2) AS avg_cpl,
    ROUND(ca.total_cost / NULLIF(ca.total_deals_won, 0), 2) AS avg_cac,
    ROUND((ca.total_revenue - ca.total_cost) / NULLIF(ca.total_cost, 0) * 100, 2) AS overall_roi
  FROM channel_agg ca
  CROSS JOIN deal_count dc;
END;
$function$;