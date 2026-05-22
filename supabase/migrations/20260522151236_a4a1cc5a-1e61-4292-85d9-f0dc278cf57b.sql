
CREATE OR REPLACE FUNCTION public.enqueue_call_transcript(p_call_log_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cl record;
  v_id uuid;
  v_consent text;
BEGIN
  SELECT id, brand_id, contact_id, recording_url INTO v_cl
  FROM call_logs WHERE id = p_call_log_id;
  IF v_cl.id IS NULL THEN RAISE EXCEPTION 'call_log not found'; END IF;
  IF v_cl.recording_url IS NULL OR v_cl.recording_url = '' THEN RETURN NULL; END IF;
  IF v_cl.contact_id IS NULL THEN RETURN NULL; END IF;

  SELECT id INTO v_id FROM call_transcripts WHERE call_log_id = p_call_log_id;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  SELECT CASE
    WHEN marketing_consent IS TRUE THEN 'granted'
    WHEN marketing_consent IS FALSE THEN 'denied'
    ELSE 'unknown'
  END INTO v_consent
  FROM contacts WHERE id = v_cl.contact_id;

  INSERT INTO call_transcripts (call_log_id, brand_id, contact_id, recording_url, stt_status, ai_status, consent_status)
  VALUES (p_call_log_id, v_cl.brand_id, v_cl.contact_id, v_cl.recording_url, 'pending', 'pending', COALESCE(v_consent, 'unknown'))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enqueue_call_transcript(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enqueue_call_transcript(uuid) TO authenticated, service_role;
