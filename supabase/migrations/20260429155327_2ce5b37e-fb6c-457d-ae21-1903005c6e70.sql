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

  RETURN jsonb_build_object(
    'phone_normalized', v_normalized,
    'contact_id', v_contact_id,
    'contact_found', v_contact_count > 0,
    'phone_rows', v_phone_count,
    'recent_lead_events', v_lead_event_count,
    'snapshot_at', now()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.e2e_revenue_snapshot(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.e2e_revenue_snapshot(TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION public.e2e_revenue_snapshot(TEXT) IS
  'E2E helper. Returns contact + lead_events presence for a given phone. Read-only, no PII exposed beyond counts.';