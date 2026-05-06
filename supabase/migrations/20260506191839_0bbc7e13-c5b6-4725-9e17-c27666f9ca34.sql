
CREATE OR REPLACE FUNCTION public.cron_relay_status(
  p_from timestamptz DEFAULT (now() - interval '24 hours'),
  p_to timestamptz DEFAULT now(),
  p_brand_id uuid DEFAULT NULL
)
RETURNS TABLE (
  job_name text,
  brand_id uuid,
  total bigint,
  successes bigint,
  errors bigint,
  error_rate numeric,
  avg_duration_ms numeric,
  p95_duration_ms numeric,
  max_duration_ms integer,
  last_run_at timestamptz,
  last_status integer,
  last_error text,
  last_duration_ms integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT *
    FROM public.cron_relay_log
    WHERE created_at >= p_from
      AND created_at <  p_to
      AND (p_brand_id IS NULL OR brand_id = p_brand_id)
  ),
  agg AS (
    SELECT
      job_name,
      brand_id,
      count(*)::bigint AS total,
      count(*) FILTER (WHERE upstream_status BETWEEN 200 AND 399)::bigint AS successes,
      count(*) FILTER (WHERE upstream_status IS NULL OR upstream_status = 0 OR upstream_status >= 400)::bigint AS errors,
      round(avg(duration_ms)::numeric, 1) AS avg_duration_ms,
      round((percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms))::numeric, 1) AS p95_duration_ms,
      max(duration_ms) AS max_duration_ms
    FROM base
    GROUP BY job_name, brand_id
  ),
  last_run AS (
    SELECT DISTINCT ON (job_name, brand_id)
      job_name, brand_id, created_at, upstream_status, error, duration_ms
    FROM base
    ORDER BY job_name, brand_id, created_at DESC
  )
  SELECT
    a.job_name,
    a.brand_id,
    a.total,
    a.successes,
    a.errors,
    CASE WHEN a.total > 0 THEN round((a.errors::numeric / a.total) * 100, 1) ELSE 0 END AS error_rate,
    a.avg_duration_ms,
    a.p95_duration_ms,
    a.max_duration_ms,
    l.created_at AS last_run_at,
    l.upstream_status AS last_status,
    l.error AS last_error,
    l.duration_ms AS last_duration_ms
  FROM agg a
  LEFT JOIN last_run l USING (job_name, brand_id)
  WHERE public.has_role(public.get_user_id(auth.uid()), 'admin'::app_role)
     OR public.has_role(public.get_user_id(auth.uid()), 'ceo'::app_role)
  ORDER BY a.errors DESC, a.total DESC
  LIMIT 500;
$$;

REVOKE ALL ON FUNCTION public.cron_relay_status(timestamptz, timestamptz, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cron_relay_status(timestamptz, timestamptz, uuid) TO authenticated;
