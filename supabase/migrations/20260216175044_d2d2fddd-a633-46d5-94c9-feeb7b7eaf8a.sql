
CREATE OR REPLACE FUNCTION get_ad_platform_stats_summary(
  p_brand_id uuid,
  p_from date,
  p_to date,
  p_platform text DEFAULT NULL,
  p_campaign_id uuid DEFAULT NULL
)
RETURNS TABLE(
  total_spend numeric,
  total_impressions bigint,
  total_clicks bigint,
  total_conversions numeric,
  total_reach bigint,
  avg_frequency numeric,
  avg_ctr numeric,
  avg_cpm numeric,
  avg_cpc numeric,
  last_import timestamptz,
  total_leads bigint
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand_ids uuid[];
BEGIN
  IF p_brand_id = '00000000-0000-0000-0000-000000000000' THEN
    SELECT array_agg(DISTINCT ur.brand_id)
    INTO v_brand_ids
    FROM user_roles ur
    WHERE ur.user_id = get_user_id(auth.uid())
      AND ur.is_active = true
      AND ur.brand_id <> '00000000-0000-0000-0000-000000000000';
  ELSE
    IF NOT has_marketing_access(get_user_id(auth.uid()), p_brand_id) THEN
      RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
    END IF;
    v_brand_ids := ARRAY[p_brand_id];
  END IF;

  RETURN QUERY
  WITH ad_summary AS (
    SELECT 
      COALESCE(SUM(s.spend), 0) AS t_spend,
      COALESCE(SUM(s.impressions), 0)::BIGINT AS t_impressions,
      COALESCE(SUM(s.clicks), 0)::BIGINT AS t_clicks,
      COALESCE(SUM(s.conversions), 0) AS t_conversions,
      COALESCE(SUM(s.reach), 0)::BIGINT AS t_reach,
      CASE WHEN SUM(COALESCE(s.reach, 0)) > 0
        THEN ROUND(SUM(s.impressions)::NUMERIC / SUM(s.reach), 2)
        ELSE NULL
      END AS f_frequency,
      CASE WHEN SUM(s.impressions) > 0 THEN ROUND((SUM(s.clicks)::NUMERIC / SUM(s.impressions)) * 100, 2) ELSE NULL END AS f_ctr,
      CASE WHEN SUM(s.impressions) > 0 THEN ROUND((SUM(s.spend) / SUM(s.impressions)) * 1000, 2) ELSE NULL END AS f_cpm,
      CASE WHEN SUM(s.clicks) > 0 THEN ROUND(SUM(s.spend) / SUM(s.clicks), 2) ELSE NULL END AS f_cpc,
      MAX(s.imported_at) AS f_last_import
    FROM ad_platform_stats s
    WHERE s.brand_id = ANY(v_brand_ids)
      AND s.stat_date >= p_from
      AND s.stat_date <= p_to
      AND (p_platform IS NULL OR s.platform = p_platform::ad_platform)
      AND (p_campaign_id IS NULL OR s.campaign_id = p_campaign_id)
  ),
  lead_summary AS (
    SELECT COUNT(DISTINCT le.id)::BIGINT AS t_leads
    FROM lead_events le
    WHERE le.brand_id = ANY(v_brand_ids)
      AND le.received_at >= p_from::timestamptz
      AND le.received_at < (p_to + 1)::timestamptz
  )
  SELECT 
    a.t_spend,
    a.t_impressions,
    a.t_clicks,
    a.t_conversions,
    a.t_reach,
    a.f_frequency,
    a.f_ctr,
    a.f_cpm,
    a.f_cpc,
    a.f_last_import,
    l.t_leads
  FROM ad_summary a, lead_summary l;
END;
$$;
