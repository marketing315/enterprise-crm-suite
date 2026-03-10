DROP FUNCTION IF EXISTS public.get_ad_platform_stats_summary(uuid, date, date, text, text);

CREATE FUNCTION public.get_ad_platform_stats_summary(
  p_brand_id uuid,
  p_from date,
  p_to date,
  p_platform text DEFAULT NULL,
  p_campaign_id text DEFAULT NULL
)
RETURNS TABLE(
  total_spend numeric,
  total_impressions bigint,
  total_clicks bigint,
  total_conversions bigint,
  total_reach bigint,
  total_leads bigint,
  avg_frequency numeric,
  avg_ctr numeric,
  avg_cpm numeric,
  avg_cpc numeric,
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
      COALESCE(SUM(aps.spend), 0)::numeric AS t_spend,
      COALESCE(SUM(aps.impressions), 0)::bigint AS t_impressions,
      COALESCE(SUM(aps.clicks), 0)::bigint AS t_clicks,
      COALESCE(SUM(aps.conversions), 0)::bigint AS t_conversions,
      COALESCE(SUM(aps.reach), 0)::bigint AS t_reach,
      CASE WHEN SUM(aps.reach) > 0
           THEN ROUND(SUM(aps.impressions)::numeric / NULLIF(SUM(aps.reach), 0), 2)
           ELSE NULL END AS t_frequency
    FROM ad_platform_stats aps
    WHERE (v_is_company_brand OR aps.brand_id = p_brand_id)
      AND aps.stat_date BETWEEN p_from AND p_to
      AND (p_platform IS NULL OR aps.platform::text = p_platform)
      AND (p_campaign_id IS NULL OR aps.campaign_id::text = p_campaign_id)
  ),
  lead_data AS (
    SELECT COUNT(DISTINCT le.contact_id)::bigint AS t_leads
    FROM lead_events le
    WHERE (v_is_company_brand OR le.brand_id = p_brand_id)
      AND le.received_at >= p_from::timestamptz
      AND le.received_at < (p_to + 1)::timestamptz
      AND le.contact_id IS NOT NULL
      AND (le.archived = false OR le.archived IS NULL)
  )
  SELECT
    ad.t_spend,
    ad.t_impressions,
    ad.t_clicks,
    ad.t_conversions,
    ad.t_reach,
    ld.t_leads,
    ad.t_frequency,
    CASE WHEN ad.t_impressions > 0 THEN ROUND((ad.t_clicks::numeric / ad.t_impressions) * 100, 2) ELSE NULL END,
    CASE WHEN ad.t_impressions > 0 THEN ROUND((ad.t_spend / ad.t_impressions) * 1000, 2) ELSE NULL END,
    CASE WHEN ad.t_clicks > 0 THEN ROUND(ad.t_spend / ad.t_clicks, 2) ELSE NULL END,
    CASE WHEN ld.t_leads > 0 AND ad.t_spend > 0
         THEN ROUND(ad.t_spend / ld.t_leads, 2)
         ELSE NULL END
  FROM ad_data ad, lead_data ld;
END;
$function$;