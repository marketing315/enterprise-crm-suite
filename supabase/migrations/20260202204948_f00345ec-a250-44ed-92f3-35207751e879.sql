-- Drop existing functions and recreate with proper security pattern
-- All three RPCs will use early authorization check instead of inline filter

-- Drop all existing versions
DROP FUNCTION IF EXISTS public.get_ad_platform_stats(uuid, date, date, ad_platform);
DROP FUNCTION IF EXISTS public.get_ad_platform_stats_trend(uuid, date, date, ad_platform);
DROP FUNCTION IF EXISTS public.get_ad_platform_stats_summary(uuid, date, date, ad_platform);

-- Recreate get_ad_platform_stats with CTE guard and fixed GROUP BY
CREATE OR REPLACE FUNCTION public.get_ad_platform_stats(
  p_brand_id uuid,
  p_from date,
  p_to date,
  p_platform ad_platform DEFAULT NULL
)
RETURNS TABLE (
  external_campaign_id text,
  external_campaign_name text,
  campaign_id uuid,
  campaign_name text,
  platform ad_platform,
  total_spend numeric,
  total_impressions bigint,
  total_clicks bigint,
  total_conversions numeric,
  ctr numeric,
  cpm numeric,
  cpc numeric,
  days_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Guard clause: check authorization once at the start
  IF NOT has_marketing_access(get_user_id(auth.uid()), p_brand_id) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT 
    s.external_campaign_id,
    MAX(s.external_campaign_name)::text AS external_campaign_name,
    s.campaign_id,
    MAX(mc.name)::text AS campaign_name,
    s.platform,
    SUM(s.spend) AS total_spend,
    SUM(s.impressions)::BIGINT AS total_impressions,
    SUM(s.clicks)::BIGINT AS total_clicks,
    SUM(COALESCE(s.conversions, 0)) AS total_conversions,
    CASE 
      WHEN SUM(s.impressions) > 0 THEN ROUND((SUM(s.clicks)::NUMERIC / SUM(s.impressions)) * 100, 2)
      ELSE NULL 
    END AS ctr,
    CASE 
      WHEN SUM(s.impressions) > 0 THEN ROUND((SUM(s.spend) / SUM(s.impressions)) * 1000, 2)
      ELSE NULL 
    END AS cpm,
    CASE 
      WHEN SUM(s.clicks) > 0 THEN ROUND(SUM(s.spend) / SUM(s.clicks), 2)
      ELSE NULL 
    END AS cpc,
    COUNT(DISTINCT s.stat_date)::INTEGER AS days_count
  FROM ad_platform_stats s
  LEFT JOIN marketing_campaigns mc ON mc.id = s.campaign_id
  WHERE s.brand_id = p_brand_id
    AND s.stat_date >= p_from
    AND s.stat_date <= p_to
    AND (p_platform IS NULL OR s.platform = p_platform)
  GROUP BY s.external_campaign_id, s.campaign_id, s.platform
  ORDER BY total_spend DESC NULLS LAST;
END;
$$;

-- Recreate get_ad_platform_stats_trend with guard clause
CREATE OR REPLACE FUNCTION public.get_ad_platform_stats_trend(
  p_brand_id uuid,
  p_from date,
  p_to date,
  p_platform ad_platform DEFAULT NULL
)
RETURNS TABLE (
  stat_date date,
  total_spend numeric,
  total_impressions bigint,
  total_clicks bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Guard clause: check authorization once at the start
  IF NOT has_marketing_access(get_user_id(auth.uid()), p_brand_id) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT 
    s.stat_date,
    SUM(s.spend) AS total_spend,
    SUM(s.impressions)::BIGINT AS total_impressions,
    SUM(s.clicks)::BIGINT AS total_clicks
  FROM ad_platform_stats s
  WHERE s.brand_id = p_brand_id
    AND s.stat_date >= p_from
    AND s.stat_date <= p_to
    AND (p_platform IS NULL OR s.platform = p_platform)
  GROUP BY s.stat_date
  ORDER BY s.stat_date ASC;
END;
$$;

-- Recreate get_ad_platform_stats_summary with guard clause
CREATE OR REPLACE FUNCTION public.get_ad_platform_stats_summary(
  p_brand_id uuid,
  p_from date,
  p_to date,
  p_platform ad_platform DEFAULT NULL
)
RETURNS TABLE (
  total_spend numeric,
  total_impressions bigint,
  total_clicks bigint,
  total_conversions numeric,
  avg_ctr numeric,
  avg_cpm numeric,
  avg_cpc numeric,
  last_import timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Guard clause: check authorization once at the start
  IF NOT has_marketing_access(get_user_id(auth.uid()), p_brand_id) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT 
    COALESCE(SUM(s.spend), 0) AS total_spend,
    COALESCE(SUM(s.impressions), 0)::BIGINT AS total_impressions,
    COALESCE(SUM(s.clicks), 0)::BIGINT AS total_clicks,
    COALESCE(SUM(s.conversions), 0) AS total_conversions,
    CASE 
      WHEN SUM(s.impressions) > 0 THEN ROUND((SUM(s.clicks)::NUMERIC / SUM(s.impressions)) * 100, 2)
      ELSE NULL 
    END AS avg_ctr,
    CASE 
      WHEN SUM(s.impressions) > 0 THEN ROUND((SUM(s.spend) / SUM(s.impressions)) * 1000, 2)
      ELSE NULL 
    END AS avg_cpm,
    CASE 
      WHEN SUM(s.clicks) > 0 THEN ROUND(SUM(s.spend) / SUM(s.clicks), 2)
      ELSE NULL 
    END AS avg_cpc,
    MAX(s.imported_at) AS last_import
  FROM ad_platform_stats s
  WHERE s.brand_id = p_brand_id
    AND s.stat_date >= p_from
    AND s.stat_date <= p_to
    AND (p_platform IS NULL OR s.platform = p_platform);
END;
$$;