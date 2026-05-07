CREATE OR REPLACE FUNCTION public.cleanup_system_log_tables(p_batch_size int DEFAULT 50000)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_cron_deleted bigint := 0;
  v_http_deleted bigint := 0;
  v_n bigint;
BEGIN
  -- cron.job_run_details: keep 7 giorni, batched
  LOOP
    WITH del AS (
      DELETE FROM cron.job_run_details
      WHERE runid IN (
        SELECT runid FROM cron.job_run_details
        WHERE COALESCE(end_time, start_time) < now() - interval '7 days'
        LIMIT p_batch_size
      )
      RETURNING 1
    )
    SELECT count(*) INTO v_n FROM del;
    v_cron_deleted := v_cron_deleted + v_n;
    EXIT WHEN v_n = 0;
  END LOOP;

  -- net._http_response: keep 2 giorni, batched
  LOOP
    WITH del AS (
      DELETE FROM net._http_response
      WHERE id IN (
        SELECT id FROM net._http_response
        WHERE created < now() - interval '2 days'
        LIMIT p_batch_size
      )
      RETURNING 1
    )
    SELECT count(*) INTO v_n FROM del;
    v_http_deleted := v_http_deleted + v_n;
    EXIT WHEN v_n = 0;
  END LOOP;

  RETURN jsonb_build_object(
    'cron_job_run_details_deleted', v_cron_deleted,
    'net_http_response_deleted', v_http_deleted,
    'ran_at', now()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cleanup_system_log_tables(int) FROM PUBLIC, anon, authenticated;

SELECT cron.schedule(
  'cleanup-system-log-tables-hourly',
  '23 * * * *',
  $$SELECT public.cleanup_system_log_tables();$$
);
