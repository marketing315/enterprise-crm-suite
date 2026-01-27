-- Update webhook_metrics_24h to include latency percentiles (P50, P95, P99)
-- Only calculated on successful deliveries with non-null duration_ms

CREATE OR REPLACE FUNCTION public.webhook_metrics_24h(p_brand_id uuid)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH recent_deliveries AS (
    SELECT 
      status,
      duration_ms
    FROM outbound_webhook_deliveries
    WHERE brand_id = p_brand_id
      AND created_at >= now() - interval '24 hours'
  ),
  agg AS (
    SELECT
      COUNT(*) FILTER (WHERE TRUE) AS total_deliveries,
      COUNT(*) FILTER (WHERE status = 'success') AS success_count,
      COUNT(*) FILTER (WHERE status = 'failed') AS failed_count,
      COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
      COUNT(*) FILTER (WHERE status = 'sending') AS sending_count,
      ROUND(AVG(duration_ms) FILTER (WHERE status = 'success' AND duration_ms IS NOT NULL)::numeric, 0) AS avg_latency_ms
    FROM recent_deliveries
  ),
  percentiles AS (
    SELECT
      ROUND(percentile_cont(0.50) WITHIN GROUP (ORDER BY duration_ms)::numeric, 0) AS p50_latency_ms,
      ROUND(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)::numeric, 0) AS p95_latency_ms,
      ROUND(percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_ms)::numeric, 0) AS p99_latency_ms
    FROM recent_deliveries
    WHERE status = 'success' AND duration_ms IS NOT NULL
  )
  SELECT json_build_object(
    'total_deliveries', COALESCE(agg.total_deliveries, 0),
    'success_count', COALESCE(agg.success_count, 0),
    'failed_count', COALESCE(agg.failed_count, 0),
    'pending_count', COALESCE(agg.pending_count, 0),
    'sending_count', COALESCE(agg.sending_count, 0),
    'avg_attempts', 1,
    'avg_latency_ms', agg.avg_latency_ms,
    'p50_latency_ms', percentiles.p50_latency_ms,
    'p95_latency_ms', percentiles.p95_latency_ms,
    'p99_latency_ms', percentiles.p99_latency_ms,
    'computed_at', now()
  )
  FROM agg, percentiles;
$$;

-- Partial index for success deliveries to optimize percentile calculations
CREATE INDEX IF NOT EXISTS idx_outbound_webhook_deliveries_success_latency
ON public.outbound_webhook_deliveries (brand_id, created_at DESC)
WHERE status = 'success';