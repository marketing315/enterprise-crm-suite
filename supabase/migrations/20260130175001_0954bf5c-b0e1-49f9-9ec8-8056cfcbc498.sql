-- =====================================================
-- BUGFIX/HARDENING: Drop and recreate record_delivery_result
-- =====================================================

-- Drop existing function (all overloads)
DROP FUNCTION IF EXISTS public.record_delivery_result(UUID, BOOLEAN, INTEGER, TEXT, TEXT, INTEGER);
DROP FUNCTION IF EXISTS public.record_delivery_result(UUID, BOOLEAN, INTEGER, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.record_delivery_result;

-- Recreate with proper return type and explicit dead transition
CREATE FUNCTION public.record_delivery_result(
  p_delivery_id UUID,
  p_success BOOLEAN,
  p_response_status INTEGER DEFAULT NULL,
  p_response_body TEXT DEFAULT NULL,
  p_error TEXT DEFAULT NULL,
  p_duration_ms INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delivery RECORD;
  v_new_status webhook_delivery_status;
  v_next_attempt TIMESTAMP WITH TIME ZONE;
  v_is_dead BOOLEAN := FALSE;
  
  -- Exponential backoff intervals (in minutes): 1, 5, 15, 60, 360, 1440 (24h)
  v_backoff_minutes INTEGER[] := ARRAY[1, 5, 15, 60, 360, 1440];
  v_backoff_index INTEGER;
BEGIN
  -- Fetch current delivery state
  SELECT * INTO v_delivery 
  FROM outbound_webhook_deliveries 
  WHERE id = p_delivery_id 
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'delivery_not_found');
  END IF;

  IF p_success THEN
    -- SUCCESS: Mark as delivered
    v_new_status := 'success';
    v_next_attempt := NULL;
  ELSE
    -- FAILURE: Check if we've exhausted retries
    IF v_delivery.attempt_count + 1 >= v_delivery.max_attempts THEN
      -- DEAD: Maximum attempts reached
      v_new_status := 'dead';
      v_is_dead := TRUE;
      v_next_attempt := NULL;
    ELSE
      -- RETRYING: Calculate next attempt with exponential backoff + jitter
      v_new_status := 'failed';
      v_backoff_index := LEAST(v_delivery.attempt_count + 1, array_length(v_backoff_minutes, 1));
      v_next_attempt := NOW() + 
        (v_backoff_minutes[v_backoff_index] * INTERVAL '1 minute') +
        (random() * INTERVAL '30 seconds'); -- Add jitter
    END IF;
  END IF;

  -- Update delivery record
  UPDATE outbound_webhook_deliveries SET
    status = v_new_status,
    attempt_count = attempt_count + 1,
    response_status = p_response_status,
    response_body = p_response_body,
    last_error = p_error,
    duration_ms = p_duration_ms,
    next_attempt_at = COALESCE(v_next_attempt, next_attempt_at),
    dead_at = CASE WHEN v_is_dead THEN NOW() ELSE dead_at END,
    updated_at = NOW()
  WHERE id = p_delivery_id;

  RETURN jsonb_build_object(
    'status', v_new_status::text,
    'attempt', v_delivery.attempt_count + 1,
    'max_attempts', v_delivery.max_attempts,
    'is_dead', v_is_dead,
    'next_attempt_at', v_next_attempt
  );
END;
$$;

-- Grant execute to service role
GRANT EXECUTE ON FUNCTION public.record_delivery_result TO service_role;

-- Document delivery status lifecycle
COMMENT ON TABLE public.outbound_webhook_deliveries IS 
  'Outbound webhook delivery queue. Status lifecycle: pending → processing → success | failed → (retry) → dead. Max 10 attempts with exponential backoff (1m, 5m, 15m, 1h, 6h, 24h). Records marked dead after exhausting retries.';

-- Document JSON fallback behavior  
COMMENT ON COLUMN public.incoming_requests.raw_body IS 
  'Parsed JSON body (NULL if body was not valid JSON - see raw_body_text instead)';
COMMENT ON COLUMN public.incoming_requests.raw_body_text IS 
  'Raw body text preserved when JSON parsing fails - enables DLQ replay';
COMMENT ON COLUMN public.incoming_requests.dlq_reason IS 
  'DLQ classification: invalid_json, signature_failed, rate_limited, mapping_error, ai_extraction_failed, contact_creation_failed, missing_required, unknown_error';