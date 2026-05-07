-- Sprint 5: Slow query monitor (admin-only read of pg_stat_statements)
CREATE OR REPLACE FUNCTION public.get_slow_queries(p_limit integer DEFAULT 50)
RETURNS TABLE (
  query text,
  calls bigint,
  total_exec_ms double precision,
  mean_exec_ms double precision,
  max_exec_ms double precision,
  rows_returned bigint,
  shared_blks_hit bigint,
  shared_blks_read bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  -- Solo system admin (brand di sistema)
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    s.query::text,
    s.calls,
    s.total_exec_time AS total_exec_ms,
    s.mean_exec_time AS mean_exec_ms,
    s.max_exec_time AS max_exec_ms,
    s.rows AS rows_returned,
    s.shared_blks_hit,
    s.shared_blks_read
  FROM extensions.pg_stat_statements s
  WHERE s.dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
    AND s.query NOT ILIKE '%pg_stat_statements%'
    AND s.query NOT ILIKE '%pg_catalog%'
  ORDER BY s.mean_exec_time DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 200);
END;
$$;

REVOKE ALL ON FUNCTION public.get_slow_queries(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_slow_queries(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.reset_slow_queries()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  PERFORM extensions.pg_stat_statements_reset();
  PERFORM public.log_audit_event(
    'slow_queries_reset',
    'system',
    NULL,
    jsonb_build_object('reset_at', now())
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reset_slow_queries() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_slow_queries() TO authenticated;