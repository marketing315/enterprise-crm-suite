-- Per-appointment attribution lookup
CREATE OR REPLACE FUNCTION public.get_appointment_campaign_attribution(
  p_appointment_id uuid
)
RETURNS TABLE (
  appointment_id uuid,
  contact_id uuid,
  lead_event_id uuid,
  lead_event_at timestamptz,
  campaign_id uuid,
  campaign_name text,
  campaign_external_id text,
  group_id uuid,
  match_type text,
  channel_id uuid,
  matched_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_internal_user_id uuid;
  v_brand_id uuid;
  v_authorized boolean := false;
BEGIN
  v_internal_user_id := public.get_user_id(auth.uid());
  IF v_internal_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT a.brand_id INTO v_brand_id
  FROM public.appointments a
  WHERE a.id = p_appointment_id;

  IF v_brand_id IS NULL THEN
    RETURN;
  END IF;

  -- Re-use existing helper for brand membership check
  SELECT public.user_belongs_to_brand(v_internal_user_id, v_brand_id) INTO v_authorized;
  IF NOT v_authorized THEN
    RAISE EXCEPTION 'Insufficient privileges' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH appt AS (
    SELECT id, contact_id, scheduled_at, created_at
    FROM public.appointments
    WHERE id = p_appointment_id
  ),
  -- last lead_event for the contact created BEFORE the appointment was scheduled (or created)
  picked_event AS (
    SELECT le.id, le.created_at
    FROM public.lead_events le
    JOIN appt a ON a.contact_id = le.contact_id
    WHERE le.created_at <= COALESCE(a.scheduled_at, a.created_at)
    ORDER BY le.created_at DESC
    LIMIT 1
  )
  SELECT
    appt.id,
    appt.contact_id,
    pe.id,
    pe.created_at,
    mc.id,
    mc.name,
    mc.external_id,
    lca.group_id,
    lca.match_type,
    mc.channel_id,
    lca.matched_at
  FROM appt
  LEFT JOIN picked_event pe ON true
  LEFT JOIN public.lead_campaign_attribution lca ON lca.lead_event_id = pe.id
  LEFT JOIN public.marketing_campaigns mc ON mc.id = lca.campaign_id
  LIMIT 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_appointment_campaign_attribution(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_appointment_campaign_attribution(uuid) TO authenticated;


-- Bulk per-campaign appointment counts
CREATE OR REPLACE FUNCTION public.get_appointments_by_campaign(
  p_brand_id uuid,
  p_from_date date,
  p_to_date date
)
RETURNS TABLE (
  campaign_id uuid,
  campaign_name text,
  channel_id uuid,
  external_id text,
  total_appointments bigint,
  scheduled_count bigint,
  completed_count bigint,
  cancelled_count bigint,
  no_show_count bigint,
  unique_contacts bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_internal_user_id uuid;
  v_authorized boolean := false;
BEGIN
  IF p_from_date > p_to_date THEN
    RAISE EXCEPTION 'from_date must be <= to_date' USING ERRCODE = '22023';
  END IF;
  IF (p_to_date - p_from_date) > 366 THEN
    RAISE EXCEPTION 'Date range cannot exceed 366 days' USING ERRCODE = '22023';
  END IF;

  v_internal_user_id := public.get_user_id(auth.uid());
  IF v_internal_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = v_internal_user_id
      AND ur.is_active = true
      AND ur.role IN ('admin', 'ceo', 'responsabile_venditori')
      AND (
        ur.brand_id = p_brand_id
        OR ur.brand_id = '00000000-0000-0000-0000-000000000000'::uuid
      )
  ) INTO v_authorized;

  IF NOT v_authorized THEN
    RAISE EXCEPTION 'Insufficient privileges' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH appt_window AS (
    SELECT a.id, a.contact_id, a.status, a.last_outcome_code, a.scheduled_at, a.created_at
    FROM public.appointments a
    WHERE a.brand_id = p_brand_id
      AND a.created_at::date >= p_from_date
      AND a.created_at::date <= p_to_date
  ),
  resolved AS (
    SELECT
      aw.id AS appointment_id,
      aw.contact_id,
      aw.status,
      (
        SELECT lca.campaign_id
        FROM public.lead_events le
        JOIN public.lead_campaign_attribution lca ON lca.lead_event_id = le.id
        WHERE le.contact_id = aw.contact_id
          AND le.created_at <= COALESCE(aw.scheduled_at, aw.created_at)
          AND lca.brand_id = p_brand_id
        ORDER BY le.created_at DESC
        LIMIT 1
      ) AS campaign_id
    FROM appt_window aw
  )
  SELECT
    mc.id,
    mc.name,
    mc.channel_id,
    mc.external_id,
    COUNT(*)::bigint,
    COUNT(*) FILTER (WHERE r.status = 'scheduled')::bigint,
    COUNT(*) FILTER (WHERE r.status = 'completed')::bigint,
    COUNT(*) FILTER (WHERE r.status = 'cancelled')::bigint,
    COUNT(*) FILTER (WHERE r.status = 'no_show')::bigint,
    COUNT(DISTINCT r.contact_id)::bigint
  FROM resolved r
  LEFT JOIN public.marketing_campaigns mc ON mc.id = r.campaign_id
  WHERE mc.id IS NOT NULL
  GROUP BY mc.id, mc.name, mc.channel_id, mc.external_id
  ORDER BY COUNT(*) DESC
  LIMIT 500;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_appointments_by_campaign(uuid, date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_appointments_by_campaign(uuid, date, date) TO authenticated;