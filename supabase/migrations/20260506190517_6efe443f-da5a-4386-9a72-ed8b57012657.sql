
-- RPC: aggregate cron relay errors per job over time window with optional brand filter
CREATE OR REPLACE FUNCTION public.cron_error_metrics(
  p_from timestamptz DEFAULT now() - interval '24 hours',
  p_to timestamptz DEFAULT now(),
  p_brand_id uuid DEFAULT NULL
)
RETURNS TABLE(
  job_name text,
  total bigint,
  errors bigint,
  successes bigint,
  error_rate numeric,
  last_error_at timestamptz,
  last_error_status integer,
  last_error_message text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      l.job_name,
      l.upstream_status,
      l.error,
      l.created_at,
      (l.upstream_status IS NULL OR l.upstream_status = 0 OR l.upstream_status >= 400) AS is_error
    FROM public.cron_relay_log l
    WHERE l.created_at >= p_from
      AND l.created_at <= p_to
      AND (p_brand_id IS NULL OR l.brand_id = p_brand_id)
      AND (
        has_role(auth.uid(), 'admin'::app_role)
        OR has_role(auth.uid(), 'ceo'::app_role)
      )
  ),
  agg AS (
    SELECT
      job_name,
      count(*) AS total,
      count(*) FILTER (WHERE is_error) AS errors,
      count(*) FILTER (WHERE NOT is_error) AS successes
    FROM base
    GROUP BY job_name
  ),
  last_err AS (
    SELECT DISTINCT ON (job_name)
      job_name, created_at AS last_error_at, upstream_status AS last_error_status, error AS last_error_message
    FROM base
    WHERE is_error
    ORDER BY job_name, created_at DESC
  )
  SELECT
    a.job_name,
    a.total,
    a.errors,
    a.successes,
    CASE WHEN a.total > 0 THEN round((a.errors::numeric / a.total::numeric) * 100, 2) ELSE 0 END AS error_rate,
    le.last_error_at,
    le.last_error_status,
    le.last_error_message
  FROM agg a
  LEFT JOIN last_err le USING (job_name)
  ORDER BY a.errors DESC, a.total DESC;
$$;

REVOKE ALL ON FUNCTION public.cron_error_metrics(timestamptz, timestamptz, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cron_error_metrics(timestamptz, timestamptz, uuid) TO authenticated;

-- RPC: hourly bucketed errors for charting
CREATE OR REPLACE FUNCTION public.cron_error_timeseries(
  p_from timestamptz DEFAULT now() - interval '24 hours',
  p_to timestamptz DEFAULT now(),
  p_brand_id uuid DEFAULT NULL,
  p_job_name text DEFAULT NULL
)
RETURNS TABLE(
  bucket timestamptz,
  total bigint,
  errors bigint,
  successes bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    date_trunc('hour', l.created_at) AS bucket,
    count(*) AS total,
    count(*) FILTER (WHERE l.upstream_status IS NULL OR l.upstream_status = 0 OR l.upstream_status >= 400) AS errors,
    count(*) FILTER (WHERE l.upstream_status BETWEEN 200 AND 399) AS successes
  FROM public.cron_relay_log l
  WHERE l.created_at >= p_from
    AND l.created_at <= p_to
    AND (p_brand_id IS NULL OR l.brand_id = p_brand_id)
    AND (p_job_name IS NULL OR l.job_name = p_job_name)
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'ceo'::app_role)
    )
  GROUP BY 1
  ORDER BY 1;
$$;

REVOKE ALL ON FUNCTION public.cron_error_timeseries(timestamptz, timestamptz, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cron_error_timeseries(timestamptz, timestamptz, uuid, text) TO authenticated;

-- RPC: detect duplicate cron jobs by name (admin/ceo only)
CREATE OR REPLACE FUNCTION public.cron_duplicate_jobs()
RETURNS TABLE(
  jobname text,
  occurrences bigint,
  jobids bigint[],
  schedules text[],
  active_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'ceo'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    j.jobname::text,
    count(*)::bigint AS occurrences,
    array_agg(j.jobid ORDER BY j.jobid) AS jobids,
    array_agg(j.schedule ORDER BY j.jobid) AS schedules,
    count(*) FILTER (WHERE j.active)::bigint AS active_count
  FROM cron.job j
  WHERE j.jobname IS NOT NULL
  GROUP BY j.jobname
  HAVING count(*) > 1
  ORDER BY count(*) DESC, j.jobname;
END;
$$;

REVOKE ALL ON FUNCTION public.cron_duplicate_jobs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cron_duplicate_jobs() TO authenticated;
