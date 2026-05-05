-- A10: estendi event_type per coprire signup e mfa_unenroll
ALTER TABLE public.session_audit
  DROP CONSTRAINT IF EXISTS session_audit_event_type_check;

ALTER TABLE public.session_audit
  ADD CONSTRAINT session_audit_event_type_check
  CHECK (event_type IN (
    'signup',
    'signin',
    'signout',
    'token_refresh',
    'password_reset',
    'mfa_enroll',
    'mfa_unenroll',
    'mfa_challenge_success',
    'mfa_challenge_failed',
    'session_revoked'
  ));

-- Aggiorna RPC log_session_event per accettare i nuovi event_type
CREATE OR REPLACE FUNCTION public.log_session_event(
  p_event_type TEXT,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_session_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_uid UUID := auth.uid();
  v_user_id UUID;
  v_id UUID;
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  v_user_id := public.get_user_id(v_auth_uid);
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF p_event_type NOT IN (
    'signup','signin','signout','token_refresh','password_reset',
    'mfa_enroll','mfa_unenroll','mfa_challenge_success','mfa_challenge_failed'
  ) THEN
    RAISE EXCEPTION 'invalid_event_type: %', p_event_type;
  END IF;

  INSERT INTO public.session_audit (user_id, auth_user_id, event_type, ip_address, user_agent, session_id, metadata)
  VALUES (
    v_user_id, v_auth_uid, p_event_type,
    LEFT(COALESCE(p_ip_address, ''), 64),
    LEFT(COALESCE(p_user_agent, ''), 512),
    LEFT(COALESCE(p_session_id, ''), 128),
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_session_event(TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_session_event(TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;

-- Pianifica retention 90gg via pg_cron (cleanup è pure-SQL, no edge function richiesta)
DO $$
BEGIN
  -- Rimuovi job esistente se già presente
  PERFORM cron.unschedule('session-audit-cleanup-daily')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'session-audit-cleanup-daily');

  PERFORM cron.schedule(
    'session-audit-cleanup-daily',
    '15 3 * * *',
    $cmd$ SELECT public.cleanup_session_audit(); $cmd$
  );
EXCEPTION WHEN undefined_table OR undefined_function THEN
  -- pg_cron non disponibile in questo ambiente: ignora
  RAISE NOTICE 'pg_cron not available, skipping cleanup schedule';
END $$;