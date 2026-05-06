CREATE OR REPLACE FUNCTION public.admin_purge_cron_job_run_details(p_days int DEFAULT 60, p_batch int DEFAULT 5000)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
DECLARE
  cutoff timestamptz := now() - make_interval(days => p_days);
  total bigint := 0;
  deleted int;
BEGIN
  LOOP
    DELETE FROM cron.job_run_details
    WHERE ctid IN (
      SELECT ctid FROM cron.job_run_details
      WHERE start_time < cutoff
      LIMIT p_batch
    );
    GET DIAGNOSTICS deleted = ROW_COUNT;
    total := total + deleted;
    EXIT WHEN deleted = 0;
  END LOOP;
  RETURN total;
END $$;

REVOKE ALL ON FUNCTION public.admin_purge_cron_job_run_details(int,int) FROM PUBLIC, anon, authenticated;