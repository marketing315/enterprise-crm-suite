
-- 1) Add reach & frequency columns
ALTER TABLE public.ad_platform_stats
  ADD COLUMN IF NOT EXISTS reach INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS frequency NUMERIC(8,2) DEFAULT 0;

-- 2) Drop and recreate get_ad_platform_stats with campaign filter + reach/frequency + multi-brand
DROP FUNCTION IF EXISTS public.get_ad_platform_stats(uuid, date, date, ad_platform);
CREATE OR REPLACE FUNCTION public.get_ad_platform_stats(
  p_brand_id uuid,
  p_from date,
  p_to date,
  p_platform ad_platform DEFAULT NULL,
  p_campaign_id uuid DEFAULT NULL
)
RETURNS TABLE(
  external_campaign_id text,
  external_campaign_name text,
  campaign_id uuid,
  campaign_name text,
  platform ad_platform,
  brand_id uuid,
  total_spend numeric,
  total_impressions bigint,
  total_clicks bigint,
  total_conversions numeric,
  total_reach bigint,
  avg_frequency numeric,
  ctr numeric,
  cpm numeric,
  cpc numeric,
  days_count integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
  SELECT 
    s.external_campaign_id,
    MAX(s.external_campaign_name)::text AS external_campaign_name,
    s.campaign_id,
    MAX(mc.name)::text AS campaign_name,
    s.platform,
    s.brand_id,
    SUM(s.spend) AS total_spend,
    SUM(s.impressions)::BIGINT AS total_impressions,
    SUM(s.clicks)::BIGINT AS total_clicks,
    SUM(COALESCE(s.conversions, 0)) AS total_conversions,
    SUM(COALESCE(s.reach, 0))::BIGINT AS total_reach,
    CASE WHEN SUM(COALESCE(s.reach, 0)) > 0
      THEN ROUND(SUM(s.impressions)::NUMERIC / SUM(s.reach), 2)
      ELSE NULL
    END AS avg_frequency,
    CASE WHEN SUM(s.impressions) > 0 THEN ROUND((SUM(s.clicks)::NUMERIC / SUM(s.impressions)) * 100, 2) ELSE NULL END AS ctr,
    CASE WHEN SUM(s.impressions) > 0 THEN ROUND((SUM(s.spend) / SUM(s.impressions)) * 1000, 2) ELSE NULL END AS cpm,
    CASE WHEN SUM(s.clicks) > 0 THEN ROUND(SUM(s.spend) / SUM(s.clicks), 2) ELSE NULL END AS cpc,
    COUNT(DISTINCT s.stat_date)::INTEGER AS days_count
  FROM ad_platform_stats s
  LEFT JOIN marketing_campaigns mc ON mc.id = s.campaign_id
  WHERE s.brand_id = ANY(v_brand_ids)
    AND s.stat_date >= p_from
    AND s.stat_date <= p_to
    AND (p_platform IS NULL OR s.platform = p_platform)
    AND (p_campaign_id IS NULL OR s.campaign_id = p_campaign_id)
  GROUP BY s.external_campaign_id, s.campaign_id, s.platform, s.brand_id
  ORDER BY total_spend DESC NULLS LAST;
END;
$function$;

-- 3) Drop and recreate get_ad_platform_stats_summary with reach/frequency + multi-brand
DROP FUNCTION IF EXISTS public.get_ad_platform_stats_summary(uuid, date, date, ad_platform);
CREATE OR REPLACE FUNCTION public.get_ad_platform_stats_summary(
  p_brand_id uuid,
  p_from date,
  p_to date,
  p_platform ad_platform DEFAULT NULL,
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
  last_import timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
  SELECT 
    COALESCE(SUM(s.spend), 0) AS total_spend,
    COALESCE(SUM(s.impressions), 0)::BIGINT AS total_impressions,
    COALESCE(SUM(s.clicks), 0)::BIGINT AS total_clicks,
    COALESCE(SUM(s.conversions), 0) AS total_conversions,
    COALESCE(SUM(s.reach), 0)::BIGINT AS total_reach,
    CASE WHEN SUM(COALESCE(s.reach, 0)) > 0
      THEN ROUND(SUM(s.impressions)::NUMERIC / SUM(s.reach), 2)
      ELSE NULL
    END AS avg_frequency,
    CASE WHEN SUM(s.impressions) > 0 THEN ROUND((SUM(s.clicks)::NUMERIC / SUM(s.impressions)) * 100, 2) ELSE NULL END AS avg_ctr,
    CASE WHEN SUM(s.impressions) > 0 THEN ROUND((SUM(s.spend) / SUM(s.impressions)) * 1000, 2) ELSE NULL END AS avg_cpm,
    CASE WHEN SUM(s.clicks) > 0 THEN ROUND(SUM(s.spend) / SUM(s.clicks), 2) ELSE NULL END AS avg_cpc,
    MAX(s.imported_at) AS last_import
  FROM ad_platform_stats s
  WHERE s.brand_id = ANY(v_brand_ids)
    AND s.stat_date >= p_from
    AND s.stat_date <= p_to
    AND (p_platform IS NULL OR s.platform = p_platform)
    AND (p_campaign_id IS NULL OR s.campaign_id = p_campaign_id);
END;
$function$;

-- 4) Drop and recreate get_ad_platform_stats_trend with reach + multi-brand
DROP FUNCTION IF EXISTS public.get_ad_platform_stats_trend(uuid, date, date, ad_platform);
CREATE OR REPLACE FUNCTION public.get_ad_platform_stats_trend(
  p_brand_id uuid,
  p_from date,
  p_to date,
  p_platform ad_platform DEFAULT NULL,
  p_campaign_id uuid DEFAULT NULL
)
RETURNS TABLE(
  stat_date date,
  total_spend numeric,
  total_impressions bigint,
  total_clicks bigint,
  total_reach bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
  SELECT 
    s.stat_date,
    SUM(s.spend) AS total_spend,
    SUM(s.impressions)::BIGINT AS total_impressions,
    SUM(s.clicks)::BIGINT AS total_clicks,
    SUM(COALESCE(s.reach, 0))::BIGINT AS total_reach
  FROM ad_platform_stats s
  WHERE s.brand_id = ANY(v_brand_ids)
    AND s.stat_date >= p_from
    AND s.stat_date <= p_to
    AND (p_platform IS NULL OR s.platform = p_platform)
    AND (p_campaign_id IS NULL OR s.campaign_id = p_campaign_id)
  GROUP BY s.stat_date
  ORDER BY s.stat_date ASC;
END;
$function$;
