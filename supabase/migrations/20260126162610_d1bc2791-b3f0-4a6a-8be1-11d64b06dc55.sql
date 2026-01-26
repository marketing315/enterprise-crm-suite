-- Update test_webhook RPC to handle inactive webhook detection for deterministic E2E tests
CREATE OR REPLACE FUNCTION public.test_webhook(p_webhook_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand_id uuid;
  v_is_active boolean;
  v_event_id uuid := gen_random_uuid();
  v_delivery_id uuid;
  v_payload jsonb;
BEGIN
  -- Get brand_id, is_active and check webhook exists
  SELECT brand_id, is_active INTO v_brand_id, v_is_active 
  FROM outbound_webhooks WHERE id = p_webhook_id;
  
  IF v_brand_id IS NULL THEN
    RAISE EXCEPTION 'Webhook not found';
  END IF;
  
  -- Admin check
  IF NOT has_role_for_brand(get_user_id(auth.uid()), v_brand_id, 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  
  -- Build test payload (include expected error if webhook is inactive)
  v_payload := jsonb_build_object(
    'schema_version', 1,
    'event_type', 'webhook.test',
    'event_id', v_event_id,
    'occurred_at', now(),
    'brand_id', v_brand_id,
    'webhook_id', p_webhook_id,
    'data', jsonb_build_object(
      'ping', 'pong', 
      'timestamp', extract(epoch from now()),
      'webhook_active', v_is_active
    )
  );
  
  -- Insert delivery directly (bypass trigger since this is manual)
  INSERT INTO outbound_webhook_deliveries (
    webhook_id, brand_id, event_type, event_id, payload, status, next_attempt_at
  ) VALUES (
    p_webhook_id, v_brand_id, 'webhook.test', v_event_id, v_payload, 'pending', now()
  )
  RETURNING id INTO v_delivery_id;
  
  RETURN v_delivery_id;
END;
$$;