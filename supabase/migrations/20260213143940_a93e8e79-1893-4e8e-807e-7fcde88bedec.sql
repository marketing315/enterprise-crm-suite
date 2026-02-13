
-- Add leads_count to trend RPC
DROP FUNCTION IF EXISTS public.get_ad_platform_stats_trend(uuid, date, date, ad_platform, uuid);

CREATE OR REPLACE FUNCTION public.get_ad_platform_stats_trend(p_brand_id uuid, p_from date, p_to date, p_platform ad_platform DEFAULT NULL::ad_platform, p_campaign_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(stat_date date, total_spend numeric, total_impressions bigint, total_clicks bigint, total_reach bigint, leads_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
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
  WITH ad_data AS (
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
  ),
  lead_data AS (
    SELECT 
      (le.received_at AT TIME ZONE 'Europe/Rome')::date AS lead_date,
      COUNT(DISTINCT le.id)::BIGINT AS leads_count
    FROM lead_events le
    WHERE le.brand_id = ANY(v_brand_ids)
      AND le.received_at >= p_from::timestamptz
      AND le.received_at < (p_to + 1)::timestamptz
    GROUP BY (le.received_at AT TIME ZONE 'Europe/Rome')::date
  )
  SELECT 
    COALESCE(a.stat_date, l.lead_date) AS stat_date,
    COALESCE(a.total_spend, 0)::numeric AS total_spend,
    COALESCE(a.total_impressions, 0)::BIGINT AS total_impressions,
    COALESCE(a.total_clicks, 0)::BIGINT AS total_clicks,
    COALESCE(a.total_reach, 0)::BIGINT AS total_reach,
    COALESCE(l.leads_count, 0)::BIGINT AS leads_count
  FROM ad_data a
  FULL OUTER JOIN lead_data l ON a.stat_date = l.lead_date
  ORDER BY COALESCE(a.stat_date, l.lead_date) ASC;
END;
$function$;
