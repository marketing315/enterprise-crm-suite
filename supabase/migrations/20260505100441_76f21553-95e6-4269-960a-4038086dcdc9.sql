-- A9: extend session_audit event_type with 'idle_timeout'
ALTER TABLE public.session_audit
  DROP CONSTRAINT IF EXISTS session_audit_event_type_check;

ALTER TABLE public.session_audit
  ADD CONSTRAINT session_audit_event_type_check CHECK (
    event_type IN (
      'signup',
      'signin',
      'signout',
      'token_refresh',
      'password_reset',
      'mfa_enroll',
      'mfa_unenroll',
      'mfa_challenge_success',
      'mfa_challenge_failed',
      'idle_timeout'
    )
  );

-- Update RPC to accept the new event type (re-create with same signature, expanded check)
CREATE OR REPLACE FUNCTION public.log_session_event(
  p_event_type text,
  p_ip_address inet DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_session_id text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_id uuid := auth.uid();
  v_user_id uuid;
  v_id uuid;
BEGIN
  IF v_auth_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF p_event_type NOT IN (
    'signup','signin','signout','token_refresh','password_reset',
    'mfa_enroll','mfa_unenroll','mfa_challenge_success','mfa_challenge_failed',
    'idle_timeout'
  ) THEN
    RAISE EXCEPTION 'invalid event_type: %', p_event_type
      USING ERRCODE = '22023';
  END IF;

  v_user_id := public.get_user_id(v_auth_id);

  INSERT INTO public.session_audit (
    user_id, supabase_auth_id, event_type, ip_address, user_agent, session_id, metadata
  ) VALUES (
    v_user_id, v_auth_id, p_event_type,
    p_ip_address, LEFT(COALESCE(p_user_agent,''), 512),
    p_session_id, COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_session_event(text, inet, text, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.log_session_event(text, inet, text, text, jsonb) TO authenticated;