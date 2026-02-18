
-- Drop ALL overloaded versions of the problematic functions
DROP FUNCTION IF EXISTS public.get_ad_platform_stats_summary(uuid, date, date, public.ad_platform, uuid);
DROP FUNCTION IF EXISTS public.get_ad_platform_stats_summary(uuid, date, date, text, text);
DROP FUNCTION IF EXISTS public.get_ad_platform_stats_summary(uuid, date, date, public.ad_platform, text);
DROP FUNCTION IF EXISTS public.get_ad_platform_stats_summary(uuid, date, date, text, uuid);

DROP FUNCTION IF EXISTS public.get_ad_platform_stats_trend(uuid, date, date, public.ad_platform, uuid);
DROP FUNCTION IF EXISTS public.get_ad_platform_stats_trend(uuid, date, date, text, text);
DROP FUNCTION IF EXISTS public.get_ad_platform_stats_trend(uuid, date, date, public.ad_platform, text);
DROP FUNCTION IF EXISTS public.get_ad_platform_stats_trend(uuid, date, date, text, uuid);

-- Recreate get_ad_platform_stats_summary with correct types
CREATE OR REPLACE FUNCTION public.get_ad_platform_stats_summary(
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
  avg_cpl numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH ad_data AS (
    SELECT
      COALESCE(SUM(aps.spend), 0)::numeric AS total_spend,
      COALESCE(SUM(aps.impressions), 0)::bigint AS total_impressions,
      COALESCE(SUM(aps.clicks), 0)::bigint AS total_clicks,
      COALESCE(SUM(aps.conversions), 0)::bigint AS total_conversions,
      COALESCE(SUM(aps.reach), 0)::bigint AS total_reach
    FROM ad_platform_stats aps
    WHERE aps.brand_id = p_brand_id
      AND aps.stat_date BETWEEN p_from AND p_to
      AND (p_platform IS NULL OR aps.platform::text = p_platform)
      AND (p_campaign_id IS NULL OR aps.campaign_id::text = p_campaign_id)
  ),
  lead_data AS (
    SELECT COUNT(DISTINCT le.contact_id)::bigint AS total_leads
    FROM lead_events le
    JOIN contacts c ON c.id = le.contact_id
    WHERE c.brand_id = p_brand_id
      AND le.created_at::date BETWEEN p_from AND p_to
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
$$;

-- Recreate get_ad_platform_stats_trend with correct types
CREATE OR REPLACE FUNCTION public.get_ad_platform_stats_trend(
  p_brand_id uuid,
  p_from date,
  p_to date,
  p_platform text DEFAULT NULL,
  p_campaign_id text DEFAULT NULL
)
RETURNS TABLE(
  stat_date date,
  total_spend numeric,
  total_impressions bigint,
  total_clicks bigint,
  total_conversions bigint,
  total_leads bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH ad_data AS (
    SELECT
      aps.stat_date AS day,
      COALESCE(SUM(aps.spend), 0)::numeric AS total_spend,
      COALESCE(SUM(aps.impressions), 0)::bigint AS total_impressions,
      COALESCE(SUM(aps.clicks), 0)::bigint AS total_clicks,
      COALESCE(SUM(aps.conversions), 0)::bigint AS total_conversions
    FROM ad_platform_stats aps
    WHERE aps.brand_id = p_brand_id
      AND aps.stat_date BETWEEN p_from AND p_to
      AND (p_platform IS NULL OR aps.platform::text = p_platform)
      AND (p_campaign_id IS NULL OR aps.campaign_id::text = p_campaign_id)
    GROUP BY aps.stat_date
  ),
  lead_data AS (
    SELECT
      (le.created_at AT TIME ZONE 'Europe/Rome')::date AS day,
      COUNT(DISTINCT le.contact_id)::bigint AS total_leads
    FROM lead_events le
    JOIN contacts c ON c.id = le.contact_id
    WHERE c.brand_id = p_brand_id
      AND le.created_at::date BETWEEN p_from AND p_to
      AND (le.archived = false OR le.archived IS NULL)
    GROUP BY (le.created_at AT TIME ZONE 'Europe/Rome')::date
  ),
  date_series AS (
    SELECT generate_series(p_from, p_to, '1 day'::interval)::date AS day
  )
  SELECT
    ds.day AS stat_date,
    COALESCE(ad.total_spend, 0)::numeric,
    COALESCE(ad.total_impressions, 0)::bigint,
    COALESCE(ad.total_clicks, 0)::bigint,
    COALESCE(ad.total_conversions, 0)::bigint,
    COALESCE(ld.total_leads, 0)::bigint
  FROM date_series ds
  LEFT JOIN ad_data ad ON ad.day = ds.day
  LEFT JOIN lead_data ld ON ld.day = ds.day
  WHERE COALESCE(ad.total_spend, 0) > 0 OR COALESCE(ld.total_leads, 0) > 0
  ORDER BY ds.day;
END;
$$;
