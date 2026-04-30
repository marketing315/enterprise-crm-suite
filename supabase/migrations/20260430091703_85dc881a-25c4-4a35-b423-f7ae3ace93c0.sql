CREATE OR REPLACE FUNCTION public.e2e_revenue_snapshot(p_phone TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contact_id UUID;
  v_contact_count INT;
  v_lead_event_count INT;
  v_phone_count INT;
  v_normalized TEXT;
  v_deal_count INT;
  v_appointment_count INT;
  v_recent_stage_transitions INT;
  v_latest_deal_stage TEXT;
  v_recent_outcomes INT;
BEGIN
  v_normalized := regexp_replace(p_phone, '\D', '', 'g');

  SELECT contact_id INTO v_contact_id
  FROM contact_phones
  WHERE regexp_replace(phone, '\D', '', 'g') = v_normalized
     OR regexp_replace(phone, '\D', '', 'g') = right(v_normalized, 10)
  ORDER BY created_at DESC
  LIMIT 1;

  SELECT COUNT(*) INTO v_phone_count
  FROM contact_phones
  WHERE regexp_replace(phone, '\D', '', 'g') = v_normalized
     OR regexp_replace(phone, '\D', '', 'g') = right(v_normalized, 10);

  v_contact_count := CASE WHEN v_contact_id IS NOT NULL THEN 1 ELSE 0 END;

  SELECT COUNT(*) INTO v_lead_event_count
  FROM lead_events
  WHERE contact_id = v_contact_id
    AND created_at > now() - interval '5 minutes';

  IF v_contact_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_deal_count
    FROM deals
    WHERE contact_id = v_contact_id;

    SELECT ps.name INTO v_latest_deal_stage
    FROM deals d
    LEFT JOIN pipeline_stages ps ON ps.id = d.stage_id
    WHERE d.contact_id = v_contact_id
    ORDER BY d.updated_at DESC NULLS LAST
    LIMIT 1;

    SELECT COUNT(*) INTO v_recent_stage_transitions
    FROM deal_stage_transitions dst
    WHERE dst.deal_id IN (SELECT id FROM deals WHERE contact_id = v_contact_id)
      AND dst.created_at > now() - interval '10 minutes';

    SELECT COUNT(*) INTO v_appointment_count
    FROM appointments
    WHERE contact_id = v_contact_id;

    SELECT COUNT(*) INTO v_recent_outcomes
    FROM appointment_outcomes ao
    WHERE ao.appointment_id IN (
      SELECT id FROM appointments WHERE contact_id = v_contact_id
    )
    AND ao.recorded_at > now() - interval '10 minutes';
  ELSE
    v_deal_count := 0;
    v_appointment_count := 0;
    v_recent_stage_transitions := 0;
    v_recent_outcomes := 0;
  END IF;

  RETURN jsonb_build_object(
    'phone_normalized', v_normalized,
    'contact_id', v_contact_id,
    'contact_found', v_contact_count > 0,
    'phone_rows', v_phone_count,
    'recent_lead_events', v_lead_event_count,
    'deals', jsonb_build_object(
      'total', v_deal_count,
      'latest_stage_name', v_latest_deal_stage,
      'recent_stage_transitions_10min', v_recent_stage_transitions
    ),
    'appointments', jsonb_build_object(
      'total', v_appointment_count,
      'recent_outcomes_10min', v_recent_outcomes
    ),
    'snapshot_at', now()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.e2e_revenue_snapshot(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.e2e_revenue_snapshot(TEXT) TO authenticated, service_role;