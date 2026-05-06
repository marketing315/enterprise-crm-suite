-- 0) Estendo il trigger append-only per consentire bypass tramite GUC dedicato
CREATE OR REPLACE FUNCTION public.cron_relay_log_block_mutation()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  IF current_setting('role', true) = 'service_role' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF current_setting('app.cron_relay_log_allow_cleanup', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'cron_relay_log is append-only';
END
$fn$;

-- 1) cron_error_metrics: ignora sentinel lease_held (-1)
CREATE OR REPLACE FUNCTION public.cron_error_metrics(
  p_from timestamp with time zone DEFAULT (now() - '24:00:00'::interval),
  p_to timestamp with time zone DEFAULT now(),
  p_brand_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  job_name text, total bigint, errors bigint, successes bigint,
  error_rate numeric, last_error_at timestamp with time zone,
  last_error_status integer, last_error_message text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  WITH base AS (
    SELECT
      l.job_name, l.upstream_status, l.error, l.created_at,
      (l.upstream_status IS NULL OR l.upstream_status = 0 OR l.upstream_status >= 400) AS is_error
    FROM public.cron_relay_log l
    WHERE l.created_at >= p_from
      AND l.created_at <= p_to
      AND (p_brand_id IS NULL OR l.brand_id = p_brand_id)
      AND l.upstream_status IS DISTINCT FROM -1
      AND (
        has_role(auth.uid(), 'admin'::app_role)
        OR has_role(auth.uid(), 'ceo'::app_role)
      )
  ),
  agg AS (
    SELECT job_name,
      count(*) AS total,
      count(*) FILTER (WHERE is_error) AS errors,
      count(*) FILTER (WHERE NOT is_error) AS successes
    FROM base GROUP BY job_name
  ),
  last_err AS (
    SELECT DISTINCT ON (job_name)
      job_name, created_at AS last_error_at,
      upstream_status AS last_error_status, error AS last_error_message
    FROM base WHERE is_error
    ORDER BY job_name, created_at DESC
  )
  SELECT
    a.job_name, a.total, a.errors, a.successes,
    CASE WHEN a.total > 0 THEN round((a.errors::numeric / a.total) * 100, 2) ELSE 0 END,
    le.last_error_at, le.last_error_status, le.last_error_message
  FROM agg a
  LEFT JOIN last_err le USING (job_name)
  ORDER BY a.errors DESC, a.total DESC;
$fn$;

-- 2) cron_relay_status: stessa esclusione
CREATE OR REPLACE FUNCTION public.cron_relay_status(
  p_from timestamp with time zone DEFAULT (now() - '24:00:00'::interval),
  p_to timestamp with time zone DEFAULT now(),
  p_brand_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  job_name text, brand_id uuid, total bigint, successes bigint, errors bigint,
  error_rate numeric, avg_duration_ms numeric, p95_duration_ms numeric,
  max_duration_ms integer, last_run_at timestamp with time zone,
  last_status integer, last_error text, last_duration_ms integer
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  WITH base AS (
    SELECT * FROM public.cron_relay_log
    WHERE created_at >= p_from
      AND created_at <  p_to
      AND (p_brand_id IS NULL OR brand_id = p_brand_id)
      AND upstream_status IS DISTINCT FROM -1
  ),
  agg AS (
    SELECT
      job_name, brand_id,
      count(*)::bigint AS total,
      count(*) FILTER (WHERE upstream_status BETWEEN 200 AND 399)::bigint AS successes,
      count(*) FILTER (WHERE upstream_status IS NULL OR upstream_status = 0 OR upstream_status >= 400)::bigint AS errors,
      round(avg(duration_ms)::numeric, 1) AS avg_duration_ms,
      round((percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms))::numeric, 1) AS p95_duration_ms,
      max(duration_ms) AS max_duration_ms
    FROM base GROUP BY job_name, brand_id
  ),
  last_run AS (
    SELECT DISTINCT ON (job_name, brand_id)
      job_name, brand_id, created_at, upstream_status, error, duration_ms
    FROM base
    ORDER BY job_name, brand_id, created_at DESC
  )
  SELECT
    a.job_name, a.brand_id, a.total, a.successes, a.errors,
    CASE WHEN a.total > 0 THEN round((a.errors::numeric / a.total) * 100, 2) ELSE 0 END,
    a.avg_duration_ms, a.p95_duration_ms, a.max_duration_ms,
    lr.created_at, lr.upstream_status, lr.error, lr.duration_ms
  FROM agg a
  LEFT JOIN last_run lr USING (job_name, brand_id)
  ORDER BY a.errors DESC, a.total DESC;
$fn$;

-- 3) Funzione di retention: usa il GUC bypass
CREATE OR REPLACE FUNCTION public.cleanup_cron_relay_log()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE v_deleted integer;
BEGIN
  PERFORM set_config('app.cron_relay_log_allow_cleanup', 'on', true);
  DELETE FROM public.cron_relay_log WHERE created_at < now() - interval '30 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$fn$;

REVOKE ALL ON FUNCTION public.cleanup_cron_relay_log() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_cron_relay_log() TO service_role;

-- 4) Cron giornaliero
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'cleanup-cron-relay-log-daily';
    PERFORM cron.schedule(
      'cleanup-cron-relay-log-daily',
      '15 3 * * *',
      'SELECT public.cleanup_cron_relay_log();'
    );
  END IF;
END
$do$;

-- 5) Pulizia retroattiva una-tantum (bug già risolti)
DO $do$
DECLARE v_deleted bigint;
BEGIN
  PERFORM set_config('app.cron_relay_log_allow_cleanup', 'on', true);
  DELETE FROM public.cron_relay_log
  WHERE error = 'lease_held'
     OR error LIKE 'lease_rpc_error:function gen_random_bytes%'
     OR error LIKE 'lease_rpc_error:null value in column "brand_id"%';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE 'cron_relay_log historical cleanup: % rows', v_deleted;
END
$do$;