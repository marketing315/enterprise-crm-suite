CREATE OR REPLACE FUNCTION public.admin_purge_cron_job_run_details(p_days int DEFAULT 60, p_batch int DEFAULT 500)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
DECLARE
  cutoff timestamptz := now() - make_interval(days => p_days);
  deleted int;
BEGIN
  DELETE FROM cron.job_run_details
  WHERE runid IN (
    SELECT runid FROM cron.job_run_details
    WHERE start_time < cutoff
    ORDER BY start_time
    LIMIT p_batch
  );
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END $$;

CREATE OR REPLACE FUNCTION public.admin_count_cron_old(p_days int DEFAULT 60)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, cron
AS $$
  SELECT count(*) FROM cron.job_run_details WHERE start_time < now() - make_interval(days => p_days);
$$;

REVOKE ALL ON FUNCTION public.admin_purge_cron_job_run_details(int,int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_count_cron_old(int) FROM PUBLIC, anon, authenticated;