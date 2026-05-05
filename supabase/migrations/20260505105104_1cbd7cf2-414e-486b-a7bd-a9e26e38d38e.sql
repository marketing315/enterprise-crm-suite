-- C7: Hourly cleanup for expired/consumed oauth_sessions (retention 24h after expiry).
CREATE OR REPLACE FUNCTION public.cleanup_oauth_sessions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.oauth_sessions
  WHERE expires_at < now() - interval '24 hours'
     OR (consumed_at IS NOT NULL AND consumed_at < now() - interval '24 hours');
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cleanup_oauth_sessions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_oauth_sessions() TO service_role;

-- Schedule via pg_cron (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('oauth-sessions-cleanup-hourly');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'oauth-sessions-cleanup-hourly',
  '17 * * * *',
  $$SELECT public.cleanup_oauth_sessions();$$
);