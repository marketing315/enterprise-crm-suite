-- M8 Step D: Add webhook.test to enum and create RPC functions for webhook management

-- 1) Add webhook.test event type to enum
ALTER TYPE webhook_event_type ADD VALUE IF NOT EXISTS 'webhook.test';

-- 2) RPC: list_outbound_webhooks (admin-only, excludes secret)
CREATE OR REPLACE FUNCTION public.list_outbound_webhooks(p_brand_id uuid)
RETURNS TABLE(
  id uuid,
  name text,
  url text,
  is_active boolean,
  event_types webhook_event_type[],
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admin check
  IF NOT has_role_for_brand(get_user_id(auth.uid()), p_brand_id, 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  
  RETURN QUERY
  SELECT 
    w.id,
    w.name,
    w.url,
    w.is_active,
    w.event_types,
    w.created_at,
    w.updated_at
  FROM outbound_webhooks w
  WHERE w.brand_id = p_brand_id
  ORDER BY w.created_at DESC;
END;
$$;

-- 3) RPC: create_outbound_webhook
CREATE OR REPLACE FUNCTION public.create_outbound_webhook(
  p_brand_id uuid,
  p_name text,
  p_url text,
  p_secret text,
  p_event_types text[],
  p_is_active boolean DEFAULT true
)
RETURNS TABLE(webhook_id uuid, secret text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_webhook_id uuid;
  v_valid_events text[] := ARRAY[
    'ticket.created', 'ticket.updated', 'ticket.assigned', 
    'ticket.status_changed', 'ticket.priority_changed', 
    'ticket.sla_breached', 'ticket.resolved', 'ticket.closed',
    'contact.created', 'contact.updated',
    'deal.created', 'deal.stage_changed', 'deal.closed',
    'webhook.test'
  ];
BEGIN
  -- Admin check
  IF NOT has_role_for_brand(get_user_id(auth.uid()), p_brand_id, 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  
  -- Validate URL (must be https)
  IF NOT p_url LIKE 'https://%' THEN
    RAISE EXCEPTION 'URL must use HTTPS protocol';
  END IF;
  
  -- Validate secret length (minimum 32 chars)
  IF length(p_secret) < 32 THEN
    RAISE EXCEPTION 'Secret must be at least 32 characters';
  END IF;
  
  -- Validate event types
  IF NOT p_event_types <@ v_valid_events THEN
    RAISE EXCEPTION 'Invalid event types provided. Valid types: %', array_to_string(v_valid_events, ', ');
  END IF;
  
  -- Insert webhook
  INSERT INTO outbound_webhooks (brand_id, name, url, secret, event_types, is_active)
  VALUES (p_brand_id, p_name, p_url, p_secret, p_event_types::webhook_event_type[], p_is_active)
  RETURNING outbound_webhooks.id INTO v_webhook_id;
  
  -- Return ID and secret (secret only shown once at creation)
  RETURN QUERY SELECT v_webhook_id, p_secret;
END;
$$;

-- 4) RPC: update_outbound_webhook
CREATE OR REPLACE FUNCTION public.update_outbound_webhook(
  p_id uuid,
  p_name text DEFAULT NULL,
  p_url text DEFAULT NULL,
  p_event_types text[] DEFAULT NULL,
  p_is_active boolean DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand_id uuid;
  v_valid_events text[] := ARRAY[
    'ticket.created', 'ticket.updated', 'ticket.assigned', 
    'ticket.status_changed', 'ticket.priority_changed', 
    'ticket.sla_breached', 'ticket.resolved', 'ticket.closed',
    'contact.created', 'contact.updated',
    'deal.created', 'deal.stage_changed', 'deal.closed',
    'webhook.test'
  ];
BEGIN
  -- Get brand_id
  SELECT brand_id INTO v_brand_id FROM outbound_webhooks WHERE id = p_id;
  
  IF v_brand_id IS NULL THEN
    RAISE EXCEPTION 'Webhook not found';
  END IF;
  
  -- Admin check
  IF NOT has_role_for_brand(get_user_id(auth.uid()), v_brand_id, 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  
  -- Validate URL if provided
  IF p_url IS NOT NULL AND NOT p_url LIKE 'https://%' THEN
    RAISE EXCEPTION 'URL must use HTTPS protocol';
  END IF;
  
  -- Validate event types if provided
  IF p_event_types IS NOT NULL AND NOT p_event_types <@ v_valid_events THEN
    RAISE EXCEPTION 'Invalid event types provided';
  END IF;
  
  -- Update only provided fields
  UPDATE outbound_webhooks
  SET
    name = COALESCE(p_name, name),
    url = COALESCE(p_url, url),
    event_types = COALESCE(p_event_types::webhook_event_type[], event_types),
    is_active = COALESCE(p_is_active, is_active),
    updated_at = now()
  WHERE id = p_id;
  
  RETURN FOUND;
END;
$$;

-- 5) RPC: rotate_outbound_webhook_secret
CREATE OR REPLACE FUNCTION public.rotate_outbound_webhook_secret(
  p_id uuid,
  p_new_secret text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand_id uuid;
BEGIN
  -- Get brand_id
  SELECT brand_id INTO v_brand_id FROM outbound_webhooks WHERE id = p_id;
  
  IF v_brand_id IS NULL THEN
    RAISE EXCEPTION 'Webhook not found';
  END IF;
  
  -- Admin check
  IF NOT has_role_for_brand(get_user_id(auth.uid()), v_brand_id, 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  
  -- Validate secret length
  IF length(p_new_secret) < 32 THEN
    RAISE EXCEPTION 'Secret must be at least 32 characters';
  END IF;
  
  -- Update secret
  UPDATE outbound_webhooks
  SET secret = p_new_secret, updated_at = now()
  WHERE id = p_id;
  
  RETURN p_new_secret;
END;
$$;

-- 6) RPC: delete_outbound_webhook (hard delete after deactivating)
CREATE OR REPLACE FUNCTION public.delete_outbound_webhook(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand_id uuid;
BEGIN
  -- Get brand_id
  SELECT brand_id INTO v_brand_id FROM outbound_webhooks WHERE id = p_id;
  
  IF v_brand_id IS NULL THEN
    RETURN false;
  END IF;
  
  -- Admin check
  IF NOT has_role_for_brand(get_user_id(auth.uid()), v_brand_id, 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  
  -- First deactivate
  UPDATE outbound_webhooks SET is_active = false WHERE id = p_id;
  
  -- Delete old deliveries (keep last 7 days)
  DELETE FROM outbound_webhook_deliveries 
  WHERE webhook_id = p_id 
    AND created_at < now() - interval '7 days';
  
  -- Delete webhook
  DELETE FROM outbound_webhooks WHERE id = p_id;
  
  RETURN FOUND;
END;
$$;

-- 7) RPC: list_webhook_deliveries
CREATE OR REPLACE FUNCTION public.list_webhook_deliveries(
  p_brand_id uuid,
  p_webhook_id uuid DEFAULT NULL,
  p_status webhook_delivery_status DEFAULT NULL,
  p_event_type text DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result json;
BEGIN
  -- Admin check
  IF NOT has_role_for_brand(get_user_id(auth.uid()), p_brand_id, 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  
  WITH filtered AS (
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
    WHERE d.brand_id = p_brand_id
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
    WHERE d.brand_id = p_brand_id
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

-- 8) RPC: get_webhook_delivery (detail view with payload and response)
CREATE OR REPLACE FUNCTION public.get_webhook_delivery(p_delivery_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand_id uuid;
  v_result json;
BEGIN
  -- Get brand_id
  SELECT brand_id INTO v_brand_id FROM outbound_webhook_deliveries WHERE id = p_delivery_id;
  
  IF v_brand_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Admin check
  IF NOT has_role_for_brand(get_user_id(auth.uid()), v_brand_id, 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  
  SELECT json_build_object(
    'id', d.id,
    'webhook_id', d.webhook_id,
    'webhook_name', w.name,
    'webhook_url', w.url,
    'event_type', d.event_type,
    'event_id', d.event_id,
    'status', d.status,
    'attempt_count', d.attempt_count,
    'max_attempts', d.max_attempts,
    'next_attempt_at', d.next_attempt_at,
    'response_status', d.response_status,
    'response_body', LEFT(d.response_body, 5000),
    'last_error', d.last_error,
    'payload', d.payload,
    'created_at', d.created_at,
    'updated_at', d.updated_at
  ) INTO v_result
  FROM outbound_webhook_deliveries d
  JOIN outbound_webhooks w ON w.id = d.webhook_id
  WHERE d.id = p_delivery_id;
  
  RETURN v_result;
END;
$$;

-- 9) RPC: test_webhook (enqueue a test delivery)
CREATE OR REPLACE FUNCTION public.test_webhook(p_webhook_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand_id uuid;
  v_event_id uuid := gen_random_uuid();
  v_delivery_id uuid;
  v_payload jsonb;
BEGIN
  -- Get brand_id and check webhook exists
  SELECT brand_id INTO v_brand_id FROM outbound_webhooks WHERE id = p_webhook_id;
  
  IF v_brand_id IS NULL THEN
    RAISE EXCEPTION 'Webhook not found';
  END IF;
  
  -- Admin check
  IF NOT has_role_for_brand(get_user_id(auth.uid()), v_brand_id, 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  
  -- Build test payload
  v_payload := jsonb_build_object(
    'schema_version', 1,
    'event_type', 'webhook.test',
    'event_id', v_event_id,
    'occurred_at', now(),
    'brand_id', v_brand_id,
    'webhook_id', p_webhook_id,
    'data', jsonb_build_object('ping', 'pong', 'timestamp', extract(epoch from now()))
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