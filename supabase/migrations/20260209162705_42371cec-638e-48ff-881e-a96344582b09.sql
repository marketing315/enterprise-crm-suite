
-- Update list_webhook_deliveries to handle system brand (Azienda Intera)
CREATE OR REPLACE FUNCTION public.list_webhook_deliveries(
  p_brand_id uuid,
  p_webhook_id uuid DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_event_type text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result json;
  v_user_id uuid := get_user_id(auth.uid());
  v_is_system boolean := (p_brand_id = '00000000-0000-0000-0000-000000000000');
BEGIN
  -- Admin check: for system brand, check if user is admin on any brand
  IF v_is_system THEN
    IF NOT EXISTS (
      SELECT 1 FROM user_roles WHERE user_id = v_user_id AND role = 'admin'
    ) THEN
      RAISE EXCEPTION 'Admin access required';
    END IF;
  ELSE
    IF NOT has_role_for_brand(v_user_id, p_brand_id, 'admin') THEN
      RAISE EXCEPTION 'Admin access required';
    END IF;
  END IF;
  
  WITH user_brands AS (
    SELECT CASE 
      WHEN v_is_system THEN ur.brand_id
      ELSE p_brand_id
    END AS bid
    FROM user_roles ur
    WHERE ur.user_id = v_user_id
      AND (v_is_system OR ur.brand_id = p_brand_id)
      AND ur.brand_id != '00000000-0000-0000-0000-000000000000'
    GROUP BY 1
  ),
  filtered AS (
    SELECT 
      d.id,
      d.webhook_id,
      w.name as webhook_name,
      d.event_type,
      d.event_id,
      d.status,
      d.attempt_count,
      d.max_attempts,
      d.next_attempt_at,
      d.response_status,
      d.last_error,
      d.created_at,
      d.updated_at
    FROM outbound_webhook_deliveries d
    JOIN outbound_webhooks w ON w.id = d.webhook_id
    WHERE d.brand_id IN (SELECT bid FROM user_brands)
      AND (p_webhook_id IS NULL OR d.webhook_id = p_webhook_id)
      AND (p_status IS NULL OR d.status = p_status)
      AND (p_event_type IS NULL OR d.event_type::text = p_event_type)
    ORDER BY d.created_at DESC
    LIMIT p_limit
    OFFSET p_offset
  ),
  total AS (
    SELECT COUNT(*) as cnt
    FROM outbound_webhook_deliveries d
    WHERE d.brand_id IN (SELECT bid FROM user_brands)
      AND (p_webhook_id IS NULL OR d.webhook_id = p_webhook_id)
      AND (p_status IS NULL OR d.status = p_status)
      AND (p_event_type IS NULL OR d.event_type::text = p_event_type)
  )
  SELECT json_build_object(
    'deliveries', COALESCE((SELECT json_agg(row_to_json(f)) FROM filtered f), '[]'::json),
    'total_count', (SELECT cnt FROM total),
    'limit', p_limit,
    'offset', p_offset
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;

-- Update webhook_metrics_24h to handle system brand
CREATE OR REPLACE FUNCTION public.webhook_metrics_24h(p_brand_id uuid)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH user_brands AS (
    SELECT CASE 
      WHEN p_brand_id = '00000000-0000-0000-0000-000000000000' THEN ur.brand_id
      ELSE p_brand_id
    END AS bid
    FROM user_roles ur
    WHERE ur.user_id = get_user_id(auth.uid())
      AND (p_brand_id != '00000000-0000-0000-0000-000000000000' OR ur.brand_id != '00000000-0000-0000-0000-000000000000')
    GROUP BY 1
  ),
  recent_deliveries AS (
    SELECT 
      status,
      duration_ms,
      attempt_count
    FROM outbound_webhook_deliveries
    WHERE brand_id IN (SELECT bid FROM user_brands)
      AND created_at >= now() - interval '24 hours'
  ),
  agg AS (
    SELECT
      COUNT(*) FILTER (WHERE TRUE) AS total_deliveries,
      COUNT(*) FILTER (WHERE status = 'success') AS success_count,
      COUNT(*) FILTER (WHERE status = 'failed') AS failed_count,
      COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
      COUNT(*) FILTER (WHERE status = 'sending') AS sending_count,
      ROUND(AVG(attempt_count)::numeric, 2) AS avg_attempts,
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
    'avg_attempts', COALESCE(agg.avg_attempts, 0),
    'avg_latency_ms', agg.avg_latency_ms,
    'p50_latency_ms', percentiles.p50_latency_ms,
    'p95_latency_ms', percentiles.p95_latency_ms,
    'p99_latency_ms', percentiles.p99_latency_ms,
    'computed_at', now()
  )
  FROM agg, percentiles;
$$;
