-- M8 Step E: Webhook Monitoring Dashboard - RPC + Indexes

-- =============================================================================
-- 1. Indexes for efficient aggregation queries
-- =============================================================================

-- Index for brand + time range queries (most common pattern)
CREATE INDEX IF NOT EXISTS idx_outbound_webhook_deliveries_brand_created
  ON public.outbound_webhook_deliveries (brand_id, created_at DESC);

-- Index for status-based filtering
CREATE INDEX IF NOT EXISTS idx_outbound_webhook_deliveries_brand_status_created
  ON public.outbound_webhook_deliveries (brand_id, status, created_at DESC);

-- Index for event_type aggregation
CREATE INDEX IF NOT EXISTS idx_outbound_webhook_deliveries_brand_event_created
  ON public.outbound_webhook_deliveries (brand_id, event_type, created_at DESC);

-- Index for per-webhook analytics
CREATE INDEX IF NOT EXISTS idx_outbound_webhook_deliveries_webhook_created
  ON public.outbound_webhook_deliveries (webhook_id, created_at DESC);

-- =============================================================================
-- 2. webhook_metrics_24h - KPIs overview (admin only)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.webhook_metrics_24h(p_brand_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result json;
  v_cutoff timestamptz := now() - interval '24 hours';
BEGIN
  -- Admin check
  IF NOT has_role_for_brand(get_user_id(auth.uid()), p_brand_id, 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  SELECT json_build_object(
    'total_deliveries', (
      SELECT COUNT(*)
      FROM outbound_webhook_deliveries
      WHERE brand_id = p_brand_id
        AND created_at >= v_cutoff
    ),
    'success_count', (
      SELECT COUNT(*)
      FROM outbound_webhook_deliveries
      WHERE brand_id = p_brand_id
        AND created_at >= v_cutoff
        AND status = 'success'
    ),
    'failed_count', (
      SELECT COUNT(*)
      FROM outbound_webhook_deliveries
      WHERE brand_id = p_brand_id
        AND created_at >= v_cutoff
        AND status = 'failed'
    ),
    'pending_count', (
      SELECT COUNT(*)
      FROM outbound_webhook_deliveries
      WHERE brand_id = p_brand_id
        AND status = 'pending'
    ),
    'sending_count', (
      SELECT COUNT(*)
      FROM outbound_webhook_deliveries
      WHERE brand_id = p_brand_id
        AND status = 'sending'
    ),
    'avg_attempts', (
      SELECT COALESCE(ROUND(AVG(attempt_count)::numeric, 2), 0)
      FROM outbound_webhook_deliveries
      WHERE brand_id = p_brand_id
        AND created_at >= v_cutoff
        AND status = 'success'
    ),
    'computed_at', now()
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- =============================================================================
-- 3. webhook_timeseries_24h - Time buckets for charts
-- =============================================================================

CREATE OR REPLACE FUNCTION public.webhook_timeseries_24h(
  p_brand_id uuid,
  p_bucket_minutes int DEFAULT 15
)
RETURNS json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result json;
  v_cutoff timestamptz := now() - interval '24 hours';
  v_bucket_interval interval;
BEGIN
  -- Admin check
  IF NOT has_role_for_brand(get_user_id(auth.uid()), p_brand_id, 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  -- Clamp bucket to reasonable values
  p_bucket_minutes := GREATEST(5, LEAST(60, p_bucket_minutes));
  v_bucket_interval := (p_bucket_minutes || ' minutes')::interval;

  SELECT COALESCE(json_agg(json_build_object(
    'bucket', bucket,
    'success_count', success_count,
    'failed_count', failed_count,
    'pending_count', pending_count,
    'total_count', total_count
  ) ORDER BY bucket), '[]'::json)
  INTO v_result
  FROM (
    SELECT 
      date_trunc('hour', created_at) + 
        (floor(extract(minute from created_at) / p_bucket_minutes) * v_bucket_interval) AS bucket,
      COUNT(*) FILTER (WHERE status = 'success') AS success_count,
      COUNT(*) FILTER (WHERE status = 'failed') AS failed_count,
      COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
      COUNT(*) AS total_count
    FROM outbound_webhook_deliveries
    WHERE brand_id = p_brand_id
      AND created_at >= v_cutoff
    GROUP BY bucket
  ) t;

  RETURN v_result;
END;
$$;

-- =============================================================================
-- 4. webhook_top_errors_24h - Error analytics
-- =============================================================================

CREATE OR REPLACE FUNCTION public.webhook_top_errors_24h(
  p_brand_id uuid,
  p_limit int DEFAULT 10
)
RETURNS json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result json;
  v_cutoff timestamptz := now() - interval '24 hours';
BEGIN
  -- Admin check
  IF NOT has_role_for_brand(get_user_id(auth.uid()), p_brand_id, 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  SELECT COALESCE(json_agg(json_build_object(
    'error', COALESCE(
      CASE 
        WHEN last_error ILIKE '%timeout%' THEN 'Timeout'
        WHEN last_error ILIKE '%connection%refused%' THEN 'Connection Refused'
        WHEN last_error ILIKE '%dns%' OR last_error ILIKE '%resolve%' THEN 'DNS Error'
        WHEN last_error ILIKE '%ssl%' OR last_error ILIKE '%certificate%' THEN 'SSL/TLS Error'
        WHEN last_error ILIKE '%rate%limit%' THEN 'Rate Limited'
        WHEN last_error ILIKE '%unauthorized%' OR last_error ILIKE '%401%' THEN 'Unauthorized'
        WHEN last_error ILIKE '%forbidden%' OR last_error ILIKE '%403%' THEN 'Forbidden'
        WHEN last_error ILIKE '%not%found%' OR last_error ILIKE '%404%' THEN 'Not Found'
        WHEN last_error ILIKE '%500%' OR last_error ILIKE '%internal%server%' THEN 'Server Error (5xx)'
        ELSE LEFT(last_error, 80)
      END,
      'Unknown Error'
    ),
    'raw_error', LEFT(last_error, 200),
    'count', cnt,
    'last_occurrence', last_at
  ) ORDER BY cnt DESC), '[]'::json)
  INTO v_result
  FROM (
    SELECT 
      last_error,
      COUNT(*) AS cnt,
      MAX(created_at) AS last_at
    FROM outbound_webhook_deliveries
    WHERE brand_id = p_brand_id
      AND status = 'failed'
      AND created_at >= v_cutoff
      AND last_error IS NOT NULL
    GROUP BY last_error
    ORDER BY cnt DESC
    LIMIT p_limit
  ) t;

  RETURN v_result;
END;
$$;

-- =============================================================================
-- 5. webhook_top_event_types_24h - Event type distribution
-- =============================================================================

CREATE OR REPLACE FUNCTION public.webhook_top_event_types_24h(
  p_brand_id uuid,
  p_limit int DEFAULT 10
)
RETURNS json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result json;
  v_cutoff timestamptz := now() - interval '24 hours';
BEGIN
  -- Admin check
  IF NOT has_role_for_brand(get_user_id(auth.uid()), p_brand_id, 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  SELECT COALESCE(json_agg(json_build_object(
    'event_type', event_type,
    'total_count', total_count,
    'success_count', success_count,
    'failed_count', failed_count,
    'success_rate', CASE WHEN total_count > 0 
      THEN ROUND((success_count::numeric / total_count) * 100, 1) 
      ELSE 0 
    END
  ) ORDER BY total_count DESC), '[]'::json)
  INTO v_result
  FROM (
    SELECT 
      event_type::text,
      COUNT(*) AS total_count,
      COUNT(*) FILTER (WHERE status = 'success') AS success_count,
      COUNT(*) FILTER (WHERE status = 'failed') AS failed_count
    FROM outbound_webhook_deliveries
    WHERE brand_id = p_brand_id
      AND created_at >= v_cutoff
    GROUP BY event_type
    ORDER BY total_count DESC
    LIMIT p_limit
  ) t;

  RETURN v_result;
END;
$$;

-- =============================================================================
-- 6. webhook_top_webhooks_24h - Per-webhook performance
-- =============================================================================

CREATE OR REPLACE FUNCTION public.webhook_top_webhooks_24h(
  p_brand_id uuid,
  p_limit int DEFAULT 10
)
RETURNS json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result json;
  v_cutoff timestamptz := now() - interval '24 hours';
BEGIN
  -- Admin check
  IF NOT has_role_for_brand(get_user_id(auth.uid()), p_brand_id, 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  SELECT COALESCE(json_agg(json_build_object(
    'webhook_id', webhook_id,
    'webhook_name', webhook_name,
    'webhook_url', webhook_url,
    'total_count', total_count,
    'success_count', success_count,
    'failed_count', failed_count,
    'pending_count', pending_count,
    'fail_rate', CASE WHEN total_count > 0 
      THEN ROUND((failed_count::numeric / total_count) * 100, 1) 
      ELSE 0 
    END,
    'avg_attempts', avg_attempts
  ) ORDER BY fail_rate DESC, total_count DESC), '[]'::json)
  INTO v_result
  FROM (
    SELECT 
      d.webhook_id,
      w.name AS webhook_name,
      w.url AS webhook_url,
      COUNT(*) AS total_count,
      COUNT(*) FILTER (WHERE d.status = 'success') AS success_count,
      COUNT(*) FILTER (WHERE d.status = 'failed') AS failed_count,
      COUNT(*) FILTER (WHERE d.status = 'pending') AS pending_count,
      ROUND(AVG(d.attempt_count)::numeric, 2) AS avg_attempts
    FROM outbound_webhook_deliveries d
    JOIN outbound_webhooks w ON w.id = d.webhook_id
    WHERE d.brand_id = p_brand_id
      AND d.created_at >= v_cutoff
    GROUP BY d.webhook_id, w.name, w.url
    ORDER BY total_count DESC
    LIMIT p_limit
  ) t;

  RETURN v_result;
END;
$$;