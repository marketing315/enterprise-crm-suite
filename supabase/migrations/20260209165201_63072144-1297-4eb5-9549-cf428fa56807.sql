
-- Add configurable funnel lost threshold to brands
ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS funnel_lost_threshold_days integer NOT NULL DEFAULT 30;

-- =============================================
-- RPC 1: get_funnel_metrics
-- Returns counts for each funnel stage + conversion rates
-- =============================================
DROP FUNCTION IF EXISTS public.get_funnel_metrics(uuid, uuid, text, timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.get_funnel_metrics(
  p_brand_id uuid,
  p_user_id uuid DEFAULT NULL,
  p_role text DEFAULT NULL,
  p_from timestamptz DEFAULT now() - interval '30 days',
  p_to timestamptz DEFAULT now()
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Phase 3: Leads (unique contacts from lead_events)
  SELECT COUNT(DISTINCT le.contact_id)
  INTO v_leads
  FROM lead_events le
  WHERE le.brand_id = ANY(v_brand_ids)
    AND le.created_at >= p_from
    AND le.created_at <= p_to
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
      'impression_to_click', CASE WHEN v_impressions > 0 THEN ROUND((v_clicks::numeric / v_impressions) * 100, 2) ELSE 0 END,
      'click_to_lead', CASE WHEN v_clicks > 0 THEN ROUND((v_leads::numeric / v_clicks) * 100, 2) ELSE 0 END,
      'lead_to_called', CASE WHEN v_leads > 0 THEN ROUND((v_called::numeric / v_leads) * 100, 2) ELSE 0 END,
      'called_to_answered', CASE WHEN v_called > 0 THEN ROUND((v_answered::numeric / v_called) * 100, 2) ELSE 0 END,
      'answered_to_appointment', CASE WHEN v_answered > 0 THEN ROUND((v_appointments::numeric / v_answered) * 100, 2) ELSE 0 END,
      'appointment_to_sale', CASE WHEN v_appointments > 0 THEN ROUND((v_sales::numeric / v_appointments) * 100, 2) ELSE 0 END,
      'overall', CASE WHEN v_leads > 0 THEN ROUND((v_sales::numeric / v_leads) * 100, 2) ELSE 0 END
    )
  );

  RETURN v_result;
END;
$$;

-- =============================================
-- RPC 2: get_funnel_losses
-- Returns contacts lost at each stage
-- =============================================
DROP FUNCTION IF EXISTS public.get_funnel_losses(uuid, uuid, text, timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.get_funnel_losses(
  p_brand_id uuid,
  p_user_id uuid DEFAULT NULL,
  p_role text DEFAULT NULL,
  p_from timestamptz DEFAULT now() - interval '30 days',
  p_to timestamptz DEFAULT now()
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand_ids uuid[];
  v_threshold integer;
  v_result json;
BEGIN
  -- Resolve brand IDs
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
    RETURN json_build_object('losses', '[]'::json, 'total_lost', 0, 'by_reason', '[]'::json);
  END IF;

  SELECT COALESCE(b.funnel_lost_threshold_days, 30) INTO v_threshold FROM brands b WHERE b.id = v_brand_ids[1];

  SELECT json_build_object(
    'total_lost', COALESCE(SUM(lost_count), 0),
    'by_stage', COALESCE(json_agg(json_build_object(
      'stage', stage_label,
      'count', lost_count
    )), '[]'::json),
    'by_reason', (
      SELECT COALESCE(json_agg(json_build_object('reason', reason, 'count', cnt)), '[]'::json)
      FROM (
        -- Deals explicitly lost
        SELECT COALESCE(d.notes, 'Non specificato') AS reason, COUNT(*) AS cnt
        FROM deals d
        WHERE d.brand_id = ANY(v_brand_ids)
          AND d.status = 'lost'
          AND d.closed_at >= p_from AND d.closed_at <= p_to
          AND (p_user_id IS NULL OR p_role NOT IN ('venditore') OR d.assigned_user_id = p_user_id)
        GROUP BY COALESCE(d.notes, 'Non specificato')
        ORDER BY cnt DESC
        LIMIT 10
      ) reasons
    )
  )
  INTO v_result
  FROM (
    -- Lead senza chiamata
    SELECT 'Lead senza chiamata' AS stage_label, COUNT(DISTINCT le.contact_id) AS lost_count
    FROM lead_events le
    WHERE le.brand_id = ANY(v_brand_ids)
      AND le.created_at >= p_from AND le.created_at <= p_to
      AND le.contact_id NOT IN (
        SELECT cl.contact_id FROM call_logs cl
        WHERE cl.brand_id = ANY(v_brand_ids) AND cl.started_at >= p_from
      )
      AND le.created_at < now() - (v_threshold || ' days')::interval

    UNION ALL

    -- Chiamati ma non risposto
    SELECT 'Chiamati non risposti', COUNT(DISTINCT cl.contact_id)
    FROM call_logs cl
    WHERE cl.brand_id = ANY(v_brand_ids)
      AND cl.started_at >= p_from AND cl.started_at <= p_to
      AND cl.contact_id NOT IN (
        SELECT cl2.contact_id FROM call_logs cl2
        WHERE cl2.brand_id = ANY(v_brand_ids)
          AND cl2.started_at >= p_from
          AND cl2.status IN ('completed','answered','connected')
      )

    UNION ALL

    -- Risposti ma senza appuntamento
    SELECT 'Risposti senza appuntamento', COUNT(DISTINCT cl.contact_id)
    FROM call_logs cl
    WHERE cl.brand_id = ANY(v_brand_ids)
      AND cl.started_at >= p_from AND cl.started_at <= p_to
      AND cl.status IN ('completed','answered','connected')
      AND cl.contact_id NOT IN (
        SELECT a.contact_id FROM appointments a
        WHERE a.brand_id = ANY(v_brand_ids)
          AND a.scheduled_at >= p_from
          AND a.status != 'cancelled'
      )

    UNION ALL

    -- Appuntamenti senza vendita
    SELECT 'Appuntamenti senza vendita', COUNT(DISTINCT a.contact_id)
    FROM appointments a
    WHERE a.brand_id = ANY(v_brand_ids)
      AND a.scheduled_at >= p_from AND a.scheduled_at <= p_to
      AND a.status != 'cancelled'
      AND a.contact_id NOT IN (
        SELECT d.contact_id FROM deals d
        WHERE d.brand_id = ANY(v_brand_ids) AND d.status = 'won'
          AND d.closed_at >= p_from
      )

    UNION ALL

    -- Deal esplicitamente persi
    SELECT 'Deal persi', COUNT(DISTINCT d.contact_id)
    FROM deals d
    WHERE d.brand_id = ANY(v_brand_ids)
      AND d.status = 'lost'
      AND d.closed_at >= p_from AND d.closed_at <= p_to
      AND (p_user_id IS NULL OR p_role NOT IN ('venditore') OR d.assigned_user_id = p_user_id)
  ) stages;

  RETURN v_result;
END;
$$;

-- =============================================
-- RPC 3: get_funnel_breakdown
-- Returns funnel metrics broken down by campaign or source
-- =============================================
DROP FUNCTION IF EXISTS public.get_funnel_breakdown(uuid, uuid, text, timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.get_funnel_breakdown(
  p_brand_id uuid,
  p_user_id uuid DEFAULT NULL,
  p_role text DEFAULT NULL,
  p_from timestamptz DEFAULT now() - interval '30 days',
  p_to timestamptz DEFAULT now()
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand_ids uuid[];
  v_result json;
BEGIN
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
    RETURN json_build_object('by_campaign', '[]'::json);
  END IF;

  SELECT json_build_object(
    'by_campaign', COALESCE(json_agg(json_build_object(
      'campaign_id', campaign_id,
      'campaign_name', campaign_name,
      'impressions', impressions,
      'clicks', clicks,
      'leads', leads,
      'appointments', appointments,
      'sales', sales,
      'revenue', revenue
    )), '[]'::json)
  )
  INTO v_result
  FROM (
    SELECT
      mc.id AS campaign_id,
      mc.name AS campaign_name,
      COALESCE(SUM(aps.impressions), 0) AS impressions,
      COALESCE(SUM(aps.clicks), 0) AS clicks,
      (SELECT COUNT(DISTINCT le.contact_id)
       FROM lead_events le
       JOIN deals dd ON dd.contact_id = le.contact_id AND dd.brand_id = ANY(v_brand_ids)
       WHERE dd.marketing_campaign_id = mc.id
         AND le.created_at >= p_from AND le.created_at <= p_to
      ) AS leads,
      (SELECT COUNT(DISTINCT a.contact_id)
       FROM appointments a
       JOIN deals dd ON dd.contact_id = a.contact_id AND dd.brand_id = ANY(v_brand_ids)
       WHERE dd.marketing_campaign_id = mc.id
         AND a.scheduled_at >= p_from AND a.scheduled_at <= p_to
         AND a.status != 'cancelled'
      ) AS appointments,
      (SELECT COUNT(DISTINCT d.contact_id)
       FROM deals d
       WHERE d.marketing_campaign_id = mc.id
         AND d.brand_id = ANY(v_brand_ids)
         AND d.status = 'won'
         AND d.closed_at >= p_from AND d.closed_at <= p_to
      ) AS sales,
      (SELECT COALESCE(SUM(d.value), 0)
       FROM deals d
       WHERE d.marketing_campaign_id = mc.id
         AND d.brand_id = ANY(v_brand_ids)
         AND d.status = 'won'
         AND d.closed_at >= p_from AND d.closed_at <= p_to
      ) AS revenue
    FROM marketing_campaigns mc
    LEFT JOIN ad_platform_stats aps ON aps.campaign_id = mc.id
      AND aps.stat_date >= p_from::date AND aps.stat_date <= p_to::date
    WHERE mc.brand_id = ANY(v_brand_ids)
    GROUP BY mc.id, mc.name
    ORDER BY impressions DESC
    LIMIT 20
  ) breakdown;

  RETURN v_result;
END;
$$;
