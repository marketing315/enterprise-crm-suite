-- ========================================
-- DLQ System - Part 2: Indexes and RPCs
-- ========================================

-- 1. Index for DLQ queries (now enum value is committed)
CREATE INDEX IF NOT EXISTS idx_incoming_requests_dlq 
ON incoming_requests (brand_id, status) 
WHERE status = 'failed' OR dlq_reason IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_outbound_deliveries_dead
ON outbound_webhook_deliveries (brand_id, status)
WHERE status = 'dead';

-- ========================================
-- RPC: Replay Ingest DLQ Entry
-- ========================================
CREATE OR REPLACE FUNCTION replay_ingest_dlq(
    p_request_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_request RECORD;
    v_user_id UUID;
BEGIN
    -- Get current user
    v_user_id := get_user_id(auth.uid());
    
    -- Get the DLQ entry
    SELECT * INTO v_request
    FROM incoming_requests
    WHERE id = p_request_id;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'not_found');
    END IF;
    
    -- Verify admin access
    IF NOT has_role_for_brand(v_user_id, v_request.brand_id, 'admin') THEN
        RETURN json_build_object('success', false, 'error', 'unauthorized');
    END IF;
    
    -- Reset status to pending for reprocessing
    UPDATE incoming_requests
    SET 
        status = 'pending',
        processed = false,
        error_message = NULL,
        dlq_reason = NULL
    WHERE id = p_request_id;
    
    RETURN json_build_object(
        'success', true, 
        'message', 'Entry reset to pending for reprocessing',
        'request_id', p_request_id
    );
END;
$$;

-- ========================================
-- RPC: Replay Outbound DLQ Entry
-- ========================================
CREATE OR REPLACE FUNCTION replay_outbound_dlq(
    p_delivery_id UUID,
    p_override_url TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_delivery RECORD;
    v_user_id UUID;
BEGIN
    -- Get current user
    v_user_id := get_user_id(auth.uid());
    
    -- Get the dead delivery
    SELECT * INTO v_delivery
    FROM outbound_webhook_deliveries
    WHERE id = p_delivery_id;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'not_found');
    END IF;
    
    -- Verify admin access
    IF NOT has_role_for_brand(v_user_id, v_delivery.brand_id, 'admin') THEN
        RETURN json_build_object('success', false, 'error', 'unauthorized');
    END IF;
    
    -- Reset to pending for redelivery
    UPDATE outbound_webhook_deliveries
    SET 
        status = 'pending',
        attempt_count = 0,
        next_attempt_at = NOW(),
        dead_at = NULL,
        last_error = CASE 
            WHEN p_override_url IS NOT NULL THEN 'replayed_with_override: ' || p_override_url
            ELSE 'replayed_by_admin'
        END
    WHERE id = p_delivery_id;
    
    -- If override URL provided, store in payload metadata
    IF p_override_url IS NOT NULL THEN
        UPDATE outbound_webhook_deliveries
        SET payload = payload || jsonb_build_object('_override_url', p_override_url)
        WHERE id = p_delivery_id;
    END IF;
    
    RETURN json_build_object(
        'success', true, 
        'message', 'Delivery reset to pending',
        'delivery_id', p_delivery_id,
        'override_url', p_override_url
    );
END;
$$;

-- ========================================
-- Update record_delivery_result to handle dead status
-- ========================================
CREATE OR REPLACE FUNCTION record_delivery_result(
    p_delivery_id UUID,
    p_success BOOLEAN,
    p_response_status INT DEFAULT NULL,
    p_response_body TEXT DEFAULT NULL,
    p_error TEXT DEFAULT NULL,
    p_duration_ms INT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_delivery RECORD;
    v_new_status webhook_delivery_status;
    v_next_attempt TIMESTAMPTZ;
    v_backoff_minutes INT[];
BEGIN
    -- Get current delivery state
    SELECT * INTO v_delivery
    FROM outbound_webhook_deliveries
    WHERE id = p_delivery_id
    FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN;
    END IF;
    
    -- Calculate new status
    IF p_success THEN
        v_new_status := 'success';
        v_next_attempt := NULL;
    ELSE
        -- Check if we've exceeded max attempts -> DEAD
        IF v_delivery.attempt_count + 1 >= v_delivery.max_attempts THEN
            v_new_status := 'dead';
            v_next_attempt := NULL;
        ELSE
            v_new_status := 'failed';
            -- Exponential backoff: 1m, 5m, 15m, 1h, 6h, 24h
            v_backoff_minutes := ARRAY[1, 5, 15, 60, 360, 1440];
            v_next_attempt := NOW() + 
                (v_backoff_minutes[LEAST(v_delivery.attempt_count + 1, array_length(v_backoff_minutes, 1))]) * INTERVAL '1 minute' +
                (random() * 30) * INTERVAL '1 second'; -- jitter
        END IF;
    END IF;
    
    -- Update delivery record
    UPDATE outbound_webhook_deliveries
    SET
        status = v_new_status,
        attempt_count = attempt_count + 1,
        response_status = COALESCE(p_response_status, response_status),
        response_body = COALESCE(p_response_body, response_body),
        last_error = p_error,
        duration_ms = p_duration_ms,
        next_attempt_at = COALESCE(v_next_attempt, next_attempt_at),
        dead_at = CASE WHEN v_new_status = 'dead' THEN NOW() ELSE NULL END,
        updated_at = NOW()
    WHERE id = p_delivery_id;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION replay_ingest_dlq(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION replay_outbound_dlq(UUID, TEXT) TO authenticated;