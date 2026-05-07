-- ADR-001: estende db_size_history e formalizza monitor + alerting
-- + retention 30g per 4 tabelle log-pattern (mcp_resource_changes, incoming_requests,
--   sheets_export_logs, cron_run_log) come da audit retroattivo Deliverable 3.

-- 1) Estende db_size_history (additive)
ALTER TABLE public.db_size_history
  ADD COLUMN IF NOT EXISTS wal_bytes bigint,
  ADD COLUMN IF NOT EXISTS inactive_replication_slots jsonb;

CREATE INDEX IF NOT EXISTS idx_db_size_history_measured_at_desc
  ON public.db_size_history (measured_at DESC);

-- 2) View di alerting consumata da edge function db-growth-alert
-- Soglia CRITICAL: 6 GB su piano 8 GB Supabase (75%)
-- Soglia WARNING: crescita giornaliera > 1 GB
CREATE OR REPLACE VIEW public.v_db_growth_alerts
WITH (security_invoker = true)
AS
WITH last_8d AS (
  SELECT
    measured_at,
    total_bytes,
    LAG(total_bytes) OVER (ORDER BY measured_at) AS prev_bytes
  FROM public.db_size_history
  WHERE measured_at > now() - interval '8 days'
)
SELECT
  CASE
    WHEN total_bytes > 6 * 1024::bigint * 1024 * 1024 THEN 'CRITICAL'
    WHEN (total_bytes - COALESCE(prev_bytes, total_bytes)) > 1 * 1024::bigint * 1024 * 1024 THEN 'WARNING'
    ELSE 'OK'
  END AS severity,
  measured_at,
  pg_size_pretty(total_bytes) AS db_size,
  total_bytes,
  pg_size_pretty(GREATEST(total_bytes - COALESCE(prev_bytes, total_bytes), 0)) AS daily_growth,
  GREATEST(total_bytes - COALESCE(prev_bytes, total_bytes), 0) AS daily_growth_bytes
FROM last_8d
WHERE total_bytes > 6 * 1024::bigint * 1024 * 1024
   OR (total_bytes - COALESCE(prev_bytes, 0)) > 1 * 1024::bigint * 1024 * 1024
ORDER BY measured_at DESC;

REVOKE ALL ON public.v_db_growth_alerts FROM PUBLIC, anon;
GRANT SELECT ON public.v_db_growth_alerts TO authenticated, service_role;

COMMENT ON VIEW public.v_db_growth_alerts IS
  'ADR-001 retention. Severity CRITICAL >6GB (75% di 8GB plan), WARNING crescita >1GB/giorno.';

-- 3) RPC admin/CEO per leggere alerts (via API senza esporre la VIEW direttamente al client browser)
CREATE OR REPLACE FUNCTION public.get_db_growth_alerts()
RETURNS TABLE(
  severity text,
  measured_at timestamptz,
  db_size text,
  total_bytes bigint,
  daily_growth text,
  daily_growth_bytes bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT v.severity, v.measured_at, v.db_size, v.total_bytes, v.daily_growth, v.daily_growth_bytes
  FROM public.v_db_growth_alerts v
  WHERE public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ceo')
  ORDER BY v.measured_at DESC
  LIMIT 100;
$$;

REVOKE ALL ON FUNCTION public.get_db_growth_alerts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_db_growth_alerts() TO authenticated, service_role;