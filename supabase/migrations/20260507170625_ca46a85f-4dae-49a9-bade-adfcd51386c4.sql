-- Hotfix I/O 100% — senza modifiche a cron.* schema.

CREATE OR REPLACE FUNCTION public.cleanup_system_log_tables(p_batch_size integer DEFAULT 5000)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $fn1$
DECLARE
  v_cron_deleted bigint := 0;
  v_http_deleted bigint := 0;
BEGIN
  WITH del AS (
    DELETE FROM cron.job_run_details
    WHERE runid IN (
      SELECT runid FROM cron.job_run_details
      WHERE COALESCE(end_time, start_time) < now() - interval '7 days'
      ORDER BY start_time
      LIMIT p_batch_size
    )
    RETURNING 1
  )
  SELECT count(*) INTO v_cron_deleted FROM del;

  WITH del AS (
    DELETE FROM net._http_response
    WHERE id IN (
      SELECT id FROM net._http_response
      WHERE created < now() - interval '2 days'
      ORDER BY created
      LIMIT p_batch_size
    )
    RETURNING 1
  )
  SELECT count(*) INTO v_http_deleted FROM del;

  RETURN jsonb_build_object(
    'cron_job_run_details_deleted', v_cron_deleted,
    'net_http_response_deleted', v_http_deleted,
    'ran_at', now()
  );
END;
$fn1$;

CREATE OR REPLACE FUNCTION public.admin_purge_cron_job_run_details(p_days integer DEFAULT 30, p_batch integer DEFAULT 2000)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'cron'
AS $fn2$
DECLARE
  cutoff timestamptz := now() - make_interval(days => p_days);
  deleted int;
BEGIN
  DELETE FROM cron.job_run_details
  WHERE runid IN (
    SELECT runid FROM cron.job_run_details
    WHERE start_time < cutoff
    ORDER BY start_time
    LIMIT GREATEST(LEAST(p_batch, 5000), 100)
  );
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END
$fn2$;

DO $do1$
DECLARE v_id bigint;
BEGIN
  SELECT jobid INTO v_id FROM cron.job WHERE jobname='mcp-slo-evaluator';
  IF v_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_id);
  END IF;
END
$do1$;

DO $do2$
DECLARE v_id bigint;
BEGIN
  SELECT jobid INTO v_id FROM cron.job WHERE jobname='cleanup-system-log-tables-hourly';
  IF v_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_id);
  END IF;
  SELECT jobid INTO v_id FROM cron.job WHERE jobname='cleanup-system-log-tables-daily';
  IF v_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_id);
  END IF;
  PERFORM cron.schedule(
    'cleanup-system-log-tables-daily',
    '17 3 * * *',
    'SELECT public.cleanup_system_log_tables(5000);'
  );
END
$do2$;

DO $do3$
DECLARE
  v_id bigint;
  v_cmd text;
BEGIN
  SELECT jobid, command INTO v_id, v_cmd
  FROM cron.job WHERE jobname='process-email-queue';
  IF v_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_id);
    PERFORM cron.schedule('process-email-queue', '* * * * *', v_cmd);
  END IF;
END
$do3$;