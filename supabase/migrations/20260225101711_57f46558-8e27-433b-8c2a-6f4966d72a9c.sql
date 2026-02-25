
-- ==============================================
-- Fix marketing attribution: use ADV campaign names for matching
-- ==============================================

-- 1. Recreate get_marketing_campaign_kpis with improved matching
CREATE OR REPLACE FUNCTION public.get_marketing_campaign_kpis(
  p_brand_id uuid, p_from date, p_to date,
  p_channel_id uuid DEFAULT NULL, p_campaign_id uuid DEFAULT NULL
)
RETURNS TABLE(
  campaign_id uuid, campaign_name text, channel_name text,
  leads_count bigint, deals_count bigint, deals_won bigint,
  revenue numeric, marketing_cost numeric, cpl numeric, cac numeric, roi numeric
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
  WITH
  -- Collect all ADV campaign names linked to each marketing campaign
  adv_names AS (
    SELECT mcp.id as cid, array_agg(DISTINCT aps.external_campaign_name) as names
    FROM marketing_campaigns mcp
    JOIN ad_platform_stats aps ON (
      aps.campaign_id = mcp.id
      OR (mcp.external_id IS NOT NULL AND mcp.external_id != '' AND aps.external_campaign_id = mcp.external_id)
      -- Also match by similar name (fuzzy)
      OR aps.external_campaign_name ILIKE '%' || mcp.name || '%'
      OR mcp.name ILIKE '%' || aps.external_campaign_name || '%'
    )
    AND aps.stat_date >= p_from AND aps.stat_date <= p_to
    AND (v_is_company_brand OR aps.brand_id = p_brand_id)
    WHERE (v_is_company_brand OR mcp.brand_id = p_brand_id)
      AND (p_channel_id IS NULL OR mcp.channel_id = p_channel_id)
      AND (p_campaign_id IS NULL OR mcp.id = p_campaign_id)
    GROUP BY mcp.id
  ),
  campaign_leads AS (
    SELECT mcp.id as cid,
      COUNT(DISTINCT le.contact_id) as leads_total
    FROM marketing_campaigns mcp
    LEFT JOIN adv_names an ON an.cid = mcp.id
    LEFT JOIN lead_events le ON (
      -- Match by campaign name or external_id
      (mcp.external_id IS NOT NULL AND mcp.external_id != '' AND le.source_name ILIKE '%' || mcp.external_id || '%')
      OR le.source_name ILIKE '%' || mcp.name || '%'
      -- NEW: match by ADV campaign names
      OR EXISTS (
        SELECT 1 FROM unnest(an.names) aname
        WHERE le.source_name ILIKE '%' || aname || '%'
          OR aname ILIKE '%' || le.source_name || '%'
      )
    )
      AND le.received_at >= p_from::timestamptz AND le.received_at <= (p_to + 1)::timestamptz
      AND (v_is_company_brand OR le.brand_id = p_brand_id)
      AND (le.archived = false OR le.archived IS NULL)
    WHERE (v_is_company_brand OR mcp.brand_id = p_brand_id)
      AND (p_channel_id IS NULL OR mcp.channel_id = p_channel_id)
      AND (p_campaign_id IS NULL OR mcp.id = p_campaign_id)
    GROUP BY mcp.id
  ),
  campaign_revenue AS (
    SELECT mcp.id as cid,
      COUNT(DISTINCT d.id) as deals_total,
      COUNT(DISTINCT d.id) FILTER (WHERE d.status = 'won') as deals_won_count,
      COALESCE(SUM(DISTINCT d.value) FILTER (WHERE d.status = 'won'), 0) as total_revenue
    FROM marketing_campaigns mcp
    LEFT JOIN adv_names an ON an.cid = mcp.id
    JOIN lead_events le ON (
      (mcp.external_id IS NOT NULL AND mcp.external_id != '' AND le.source_name ILIKE '%' || mcp.external_id || '%')
      OR le.source_name ILIKE '%' || mcp.name || '%'
      OR EXISTS (
        SELECT 1 FROM unnest(an.names) aname
        WHERE le.source_name ILIKE '%' || aname || '%'
          OR aname ILIKE '%' || le.source_name || '%'
      )
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
    SELECT mcp.id as cid,
      COALESCE(SUM(aps.spend), 0) as total_spend
    FROM marketing_campaigns mcp
    JOIN ad_platform_stats aps ON (
      aps.campaign_id = mcp.id
      OR (mcp.external_id IS NOT NULL AND mcp.external_id != '' AND aps.external_campaign_id = mcp.external_id)
      OR aps.external_campaign_name ILIKE '%' || mcp.name || '%'
      OR mcp.name ILIKE '%' || aps.external_campaign_name || '%'
    )
      AND aps.stat_date >= p_from AND aps.stat_date <= p_to
      AND (v_is_company_brand OR aps.brand_id = p_brand_id)
    WHERE (v_is_company_brand OR mcp.brand_id = p_brand_id)
      AND (p_channel_id IS NULL OR mcp.channel_id = p_channel_id)
      AND (p_campaign_id IS NULL OR mcp.id = p_campaign_id)
    GROUP BY mcp.id
  )
  SELECT
    mcp.id, mcp.name,
    COALESCE(ch.name, 'Non specificato'),
    COALESCE(cl.leads_total, 0)::bigint,
    COALESCE(cr.deals_total, 0)::bigint,
    COALESCE(cr.deals_won_count, 0)::bigint,
    COALESCE(cr.total_revenue, 0)::numeric,
    COALESCE(cas.total_spend, 0)::numeric,
    ROUND(COALESCE(cas.total_spend, 0) / NULLIF(cl.leads_total, 0), 2),
    ROUND(COALESCE(cas.total_spend, 0) / NULLIF(cr.deals_won_count, 0), 2),
    ROUND((COALESCE(cr.total_revenue, 0) - COALESCE(cas.total_spend, 0)) / NULLIF(cas.total_spend, 0) * 100, 2)
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

-- 2. Recreate get_marketing_channel_kpis with improved matching
CREATE OR REPLACE FUNCTION public.get_marketing_channel_kpis(p_brand_id uuid, p_from date, p_to date)
RETURNS TABLE(
  channel_id uuid, channel_name text, channel_type text,
  campaigns_count bigint, leads_count bigint, deals_won bigint,
  revenue numeric, marketing_cost numeric, avg_roi numeric
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
    SELECT ch.id as channel_id,
      COALESCE(SUM(aps.spend), 0) as total_spend
    FROM marketing_channels ch
    JOIN ad_platform_stats aps ON aps.platform::text = ch.platform::text
      AND aps.stat_date >= p_from AND aps.stat_date <= p_to
      AND (v_is_company_brand OR aps.brand_id = p_brand_id)
    WHERE (v_is_company_brand OR ch.brand_id = p_brand_id)
      AND ch.is_active = true AND ch.platform IS NOT NULL
    GROUP BY ch.id
    HAVING SUM(aps.spend) > 0
  ),
  -- Collect ADV campaign names per channel for lead matching
  channel_adv_names AS (
    SELECT ch.id as channel_id, array_agg(DISTINCT aps.external_campaign_name) as names
    FROM marketing_channels ch
    JOIN ad_platform_stats aps ON aps.platform::text = ch.platform::text
      AND aps.stat_date >= p_from AND aps.stat_date <= p_to
      AND (v_is_company_brand OR aps.brand_id = p_brand_id)
    WHERE (v_is_company_brand OR ch.brand_id = p_brand_id)
      AND ch.is_active = true AND ch.platform IS NOT NULL
    GROUP BY ch.id
  ),
  active_channels AS (
    SELECT cas.channel_id FROM channel_adv_spend cas
  ),
  channel_leads AS (
    SELECT mcp.channel_id,
      COUNT(DISTINCT le.contact_id) as leads_total
    FROM marketing_campaigns mcp
    LEFT JOIN channel_adv_names can ON can.channel_id = mcp.channel_id
    LEFT JOIN lead_events le ON (
      (mcp.external_id IS NOT NULL AND mcp.external_id != '' AND le.source_name ILIKE '%' || mcp.external_id || '%')
      OR le.source_name ILIKE '%' || mcp.name || '%'
      -- NEW: match via ADV campaign names
      OR EXISTS (
        SELECT 1 FROM unnest(can.names) aname
        WHERE le.source_name ILIKE '%' || aname || '%'
          OR aname ILIKE '%' || le.source_name || '%'
      )
    )
      AND le.received_at >= p_from::timestamptz AND le.received_at <= (p_to + 1)::timestamptz
      AND (v_is_company_brand OR le.brand_id = p_brand_id)
      AND (le.archived = false OR le.archived IS NULL)
    WHERE (v_is_company_brand OR mcp.brand_id = p_brand_id)
      AND mcp.channel_id IN (SELECT ac.channel_id FROM active_channels ac)
    GROUP BY mcp.channel_id
  ),
  channel_revenue AS (
    SELECT ch.id as channel_id,
      COUNT(DISTINCT d.id) FILTER (WHERE d.status = 'won') as deals_won_count,
      COALESCE(SUM(DISTINCT d.value) FILTER (WHERE d.status = 'won'), 0) as total_revenue
    FROM marketing_channels ch
    LEFT JOIN channel_adv_names can ON can.channel_id = ch.id
    JOIN lead_events le ON (
      le.source_name ILIKE '%' || ch.name || '%'
      OR le.source_name ILIKE '%' || REPLACE(ch.name, ' Ads', '') || '%'
      -- NEW: match via ADV campaign names
      OR EXISTS (
        SELECT 1 FROM unnest(can.names) aname
        WHERE le.source_name ILIKE '%' || aname || '%'
          OR aname ILIKE '%' || le.source_name || '%'
      )
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
    ch.id, ch.name, ch.type,
    COUNT(DISTINCT mcp.id)::bigint,
    COALESCE(cl.leads_total, 0)::bigint,
    COALESCE(cr.deals_won_count, 0)::bigint,
    COALESCE(cr.total_revenue, 0)::numeric,
    COALESCE(cas.total_spend, 0)::numeric,
    ROUND(
      (COALESCE(cr.total_revenue, 0) - COALESCE(cas.total_spend, 0)) 
      / NULLIF(cas.total_spend, 0) * 100, 2
    )
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
