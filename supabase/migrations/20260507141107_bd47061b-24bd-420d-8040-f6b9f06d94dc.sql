-- One-shot: gira ogni minuto fino a quando le tabelle sono pulite, poi si auto-cancella
CREATE OR REPLACE FUNCTION public._oneshot_cleanup_system_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_result jsonb;
  v_remaining_cron bigint;
  v_remaining_http bigint;
BEGIN
  v_result := public.cleanup_system_log_tables(30000);
  RAISE NOTICE 'oneshot cleanup: %', v_result;

  SELECT count(*) INTO v_remaining_cron FROM cron.job_run_details
    WHERE COALESCE(end_time, start_time) < now() - interval '7 days';
  SELECT count(*) INTO v_remaining_http FROM net._http_response
    WHERE created < now() - interval '2 days';

  IF v_remaining_cron = 0 AND v_remaining_http = 0 THEN
    PERFORM cron.unschedule('oneshot-cleanup-system-logs');
    RAISE NOTICE 'cleanup completato, job disattivato';
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public._oneshot_cleanup_system_logs() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule(
  'oneshot-cleanup-system-logs',
  '* * * * *',
  $$SELECT public._oneshot_cleanup_system_logs();$$
);
