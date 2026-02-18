
-- Fix: get_marketing_campaign_kpis deve contare contatti unici (COUNT DISTINCT contact_id)
-- non eventi unici (COUNT DISTINCT le.id) per il campo leads_count.
-- Aggiunge anche filtro archived = false per escludere duplicati soppressi dal webhook-ingest.

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
  WITH campaign_leads AS (
    SELECT
      mcp.id as cid,
      -- FIX: conta contatti unici (non eventi) ed esclude eventi archiviati (duplicati soppressi)
      COUNT(DISTINCT le.contact_id) as leads_total
    FROM marketing_campaigns mcp
    LEFT JOIN lead_events le ON (
      (mcp.external_id IS NOT NULL AND le.source_name ILIKE '%' || mcp.external_id || '%')
      OR le.source_name ILIKE '%' || mcp.name || '%'
    )
      AND le.received_at >= p_from::timestamptz AND le.received_at <= (p_to + 1)::timestamptz
      AND (v_is_company_brand OR le.brand_id = p_brand_id)
      AND (le.archived = false OR le.archived IS NULL)  -- esclude duplicati soppressi
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

-- Stessa fix per get_funnel_metrics: aggiunge filtro archived = false
-- (era già COUNT DISTINCT contact_id ma non escludeva gli archiviati)
CREATE OR REPLACE FUNCTION public.get_funnel_metrics(
  p_brand_id uuid,
  p_user_id uuid DEFAULT NULL,
  p_role text DEFAULT NULL,
  p_from timestamp with time zone DEFAULT (now() - '30 days'::interval),
  p_to timestamp with time zone DEFAULT now()
)
RETURNS json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_brand_ids uuid[];
  v_impressions bigint;
  v_clicks bigint;
  v_leads bigint;
  v_called bigint;
  v_answered bigint;
  v_appointments bigint;
  v_sales bigint;
  v_sales_revenue numeric;
  v_lost_threshold integer;
  v_result json;
BEGIN
  -- Resolve brand IDs (system brand = all user brands)
  IF p_brand_id = '00000000-0000-0000-0000-000000000000' THEN
    SELECT array_agg(ur.brand_id)
    INTO v_brand_ids
    FROM user_roles ur
    WHERE ur.user_id = (SELECT u.id FROM users u WHERE u.supabase_auth_id = auth.uid())
      AND ur.is_active = true
      AND ur.brand_id != '00000000-0000-0000-0000-000000000000';
  ELSE
    v_brand_ids := ARRAY[p_brand_id];
  END IF;

  IF v_brand_ids IS NULL OR array_length(v_brand_ids, 1) IS NULL THEN
    RETURN json_build_object(
      'impressions', 0, 'clicks', 0, 'leads', 0,
      'called_contacts', 0, 'answered_contacts', 0,
      'appointments', 0, 'sales', 0, 'sales_revenue', 0,
      'lost_threshold_days', 30,
      'conversions', json_build_object()
    );
  END IF;

  -- Get lost threshold from first brand
  SELECT COALESCE(b.funnel_lost_threshold_days, 30)
  INTO v_lost_threshold
  FROM brands b WHERE b.id = v_brand_ids[1];

  -- Phase 1: Impressions (from ad_platform_stats)
  SELECT COALESCE(SUM(aps.impressions), 0)
  INTO v_impressions
  FROM ad_platform_stats aps
  WHERE aps.brand_id = ANY(v_brand_ids)
    AND aps.stat_date >= p_from::date
    AND aps.stat_date <= p_to::date;

  -- Phase 2: Clicks (from ad_platform_stats)
  SELECT COALESCE(SUM(aps.clicks), 0)
  INTO v_clicks
  FROM ad_platform_stats aps
  WHERE aps.brand_id = ANY(v_brand_ids)
    AND aps.stat_date >= p_from::date
    AND aps.stat_date <= p_to::date;

  -- Phase 3: Leads — unique contacts, excluding archived events (suppressed duplicates)
  SELECT COUNT(DISTINCT le.contact_id)
  INTO v_leads
  FROM lead_events le
  WHERE le.brand_id = ANY(v_brand_ids)
    AND le.created_at >= p_from
    AND le.created_at <= p_to
    AND (le.archived = false OR le.archived IS NULL)  -- FIX: esclude duplicati soppressi
    AND (p_user_id IS NULL OR p_role NOT IN ('operatore_callcenter','venditore')
         OR le.contact_id IN (
           SELECT d.contact_id FROM deals d
           WHERE d.assigned_user_id = p_user_id AND d.brand_id = ANY(v_brand_ids)
         ));

  -- Phase 4: Called contacts (unique contacts with at least one call)
  SELECT COUNT(DISTINCT cl.contact_id)
  INTO v_called
  FROM call_logs cl
  WHERE cl.brand_id = ANY(v_brand_ids)
    AND cl.started_at >= p_from
    AND cl.started_at <= p_to
    AND (p_user_id IS NULL OR p_role NOT IN ('operatore_callcenter')
         OR cl.user_id = p_user_id);

  -- Phase 5: Answered contacts (unique contacts with answered call)
  SELECT COUNT(DISTINCT cl.contact_id)
  INTO v_answered
  FROM call_logs cl
  WHERE cl.brand_id = ANY(v_brand_ids)
    AND cl.started_at >= p_from
    AND cl.started_at <= p_to
    AND cl.status IN ('completed','answered','connected')
    AND (cl.duration_seconds IS NULL OR cl.duration_seconds > 0)
    AND (p_user_id IS NULL OR p_role NOT IN ('operatore_callcenter')
         OR cl.user_id = p_user_id);

  -- Phase 6: Appointments (unique contacts with appointment)
  SELECT COUNT(DISTINCT a.contact_id)
  INTO v_appointments
  FROM appointments a
  WHERE a.brand_id = ANY(v_brand_ids)
    AND a.scheduled_at >= p_from
    AND a.scheduled_at <= p_to
    AND a.status NOT IN ('cancelled')
    AND (p_user_id IS NULL OR p_role NOT IN ('venditore')
         OR a.assigned_sales_user_id = p_user_id);

  -- Phase 7: Sales (deals won)
  SELECT COUNT(DISTINCT d.contact_id), COALESCE(SUM(d.value), 0)
  INTO v_sales, v_sales_revenue
  FROM deals d
  WHERE d.brand_id = ANY(v_brand_ids)
    AND d.status = 'won'
    AND d.closed_at >= p_from
    AND d.closed_at <= p_to
    AND (p_user_id IS NULL OR p_role NOT IN ('venditore')
         OR d.assigned_user_id = p_user_id);

  -- Build result with conversions
  v_result := json_build_object(
    'impressions', v_impressions,
    'clicks', v_clicks,
    'leads', v_leads,
    'called_contacts', v_called,
    'answered_contacts', v_answered,
    'appointments', v_appointments,
    'sales', v_sales,
    'sales_revenue', v_sales_revenue,
    'lost_threshold_days', v_lost_threshold,
    'conversions', json_build_object(
      'impression_to_click', CASE WHEN v_impressions > 0 THEN ROUND(v_clicks::numeric / v_impressions * 100, 2) ELSE 0 END,
      'click_to_lead', CASE WHEN v_clicks > 0 THEN ROUND(v_leads::numeric / v_clicks * 100, 2) ELSE 0 END,
      'lead_to_called', CASE WHEN v_leads > 0 THEN ROUND(v_called::numeric / v_leads * 100, 2) ELSE 0 END,
      'called_to_answered', CASE WHEN v_called > 0 THEN ROUND(v_answered::numeric / v_called * 100, 2) ELSE 0 END,
      'answered_to_appointment', CASE WHEN v_answered > 0 THEN ROUND(v_appointments::numeric / v_answered * 100, 2) ELSE 0 END,
      'appointment_to_sale', CASE WHEN v_appointments > 0 THEN ROUND(v_sales::numeric / v_appointments * 100, 2) ELSE 0 END,
      'overall', CASE WHEN v_leads > 0 THEN ROUND(v_sales::numeric / v_leads * 100, 2) ELSE 0 END
    )
  );

  RETURN v_result;
END;
$function$;
