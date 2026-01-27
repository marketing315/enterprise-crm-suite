-- Add duration_ms column for latency tracking
ALTER TABLE public.outbound_webhook_deliveries
ADD COLUMN duration_ms integer;

COMMENT ON COLUMN public.outbound_webhook_deliveries.duration_ms IS 'Duration of the last delivery attempt in milliseconds';

-- Update record_delivery_result RPC to accept duration_ms parameter
CREATE OR REPLACE FUNCTION public.record_delivery_result(
  p_delivery_id uuid,
  p_success boolean,
  p_response_status integer DEFAULT NULL,
  p_response_body text DEFAULT NULL,
  p_error text DEFAULT NULL,
  p_duration_ms integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delivery outbound_webhook_deliveries%ROWTYPE;
  v_backoff_seconds integer;
  v_backoff_array integer[] := ARRAY[60, 300, 900, 3600, 21600, 86400]; -- 1m, 5m, 15m, 1h, 6h, 24h
  v_jitter_seconds integer;
BEGIN
  -- Lock and fetch delivery
  SELECT * INTO v_delivery
  FROM outbound_webhook_deliveries
  WHERE id = p_delivery_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Delivery not found: %', p_delivery_id;
  END IF;

  -- Calculate backoff index (0-based, capped at array length)
  v_backoff_seconds := v_backoff_array[LEAST(v_delivery.attempt_count + 1, array_length(v_backoff_array, 1))];
  -- Add jitter: random 0-30% of backoff
  v_jitter_seconds := floor(random() * v_backoff_seconds * 0.3);

  IF p_success THEN
    -- Mark as success
    UPDATE outbound_webhook_deliveries
    SET
      status = 'success',
      response_status = p_response_status,
      response_body = p_response_body,
      attempt_count = attempt_count + 1,
      duration_ms = p_duration_ms,
      updated_at = now()
    WHERE id = p_delivery_id;
  ELSE
    -- Increment attempt and check if exhausted
    IF v_delivery.attempt_count + 1 >= v_delivery.max_attempts THEN
      -- Mark as failed (exhausted)
      UPDATE outbound_webhook_deliveries
      SET
        status = 'failed',
        last_error = p_error,
        response_status = p_response_status,
        response_body = p_response_body,
        attempt_count = attempt_count + 1,
        duration_ms = p_duration_ms,
        updated_at = now()
      WHERE id = p_delivery_id;
    ELSE
      -- Schedule retry with exponential backoff + jitter
      UPDATE outbound_webhook_deliveries
      SET
        status = 'pending',
        last_error = p_error,
        response_status = p_response_status,
        response_body = p_response_body,
        attempt_count = attempt_count + 1,
        duration_ms = p_duration_ms,
        next_attempt_at = now() + ((v_backoff_seconds + v_jitter_seconds) || ' seconds')::interval,
        updated_at = now()
      WHERE id = p_delivery_id;
    END IF;
  END IF;
END;
$$;

-- Update webhook_metrics_24h to include avg_latency_ms
CREATE OR REPLACE FUNCTION public.webhook_metrics_24h(p_brand_id uuid)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'total_deliveries', COUNT(*),
    'success_count', COUNT(*) FILTER (WHERE status = 'success'),
    'failed_count', COUNT(*) FILTER (WHERE status = 'failed'),
    'pending_count', COUNT(*) FILTER (WHERE status = 'pending'),
    'sending_count', COUNT(*) FILTER (WHERE status = 'sending'),
    'avg_attempts', ROUND(AVG(attempt_count)::numeric, 2),
    'avg_latency_ms', ROUND(AVG(duration_ms) FILTER (WHERE status = 'success')::numeric, 0)
  )
  FROM outbound_webhook_deliveries
  WHERE brand_id = p_brand_id
    AND created_at > now() - interval '24 hours';
$$;