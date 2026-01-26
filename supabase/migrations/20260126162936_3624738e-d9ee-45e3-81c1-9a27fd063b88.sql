-- Update create_outbound_webhook to allow http://127.0.0.1 for E2E testing
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
  
  -- Validate URL (HTTPS required, except http://127.0.0.1 or http://localhost for testing)
  IF NOT (
    p_url LIKE 'https://%' 
    OR p_url LIKE 'http://127.0.0.1%'
    OR p_url LIKE 'http://localhost%'
  ) THEN
    RAISE EXCEPTION 'URL must use HTTPS (http://127.0.0.1 allowed for testing)';
  END IF;
  
  -- Validate secret length
  IF length(p_secret) < 32 THEN
    RAISE EXCEPTION 'Secret must be at least 32 characters';
  END IF;
  
  -- Validate event types
  IF NOT (p_event_types <@ v_valid_events) THEN
    RAISE EXCEPTION 'Invalid event type(s) specified';
  END IF;
  
  -- Insert webhook
  INSERT INTO outbound_webhooks (brand_id, name, url, secret, event_types, is_active)
  VALUES (p_brand_id, p_name, p_url, p_secret, p_event_types::webhook_event_type[], p_is_active)
  RETURNING id INTO v_webhook_id;
  
  RETURN QUERY SELECT v_webhook_id, p_secret;
END;
$$;

-- Update update_outbound_webhook to allow http://127.0.0.1 for E2E testing
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
  -- Get brand_id and check exists
  SELECT brand_id INTO v_brand_id FROM outbound_webhooks WHERE id = p_id;
  
  IF v_brand_id IS NULL THEN
    RAISE EXCEPTION 'Webhook not found';
  END IF;
  
  -- Admin check
  IF NOT has_role_for_brand(get_user_id(auth.uid()), v_brand_id, 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  
  -- Validate URL if provided (HTTPS required, except loopback for testing)
  IF p_url IS NOT NULL AND NOT (
    p_url LIKE 'https://%' 
    OR p_url LIKE 'http://127.0.0.1%'
    OR p_url LIKE 'http://localhost%'
  ) THEN
    RAISE EXCEPTION 'URL must use HTTPS (http://127.0.0.1 allowed for testing)';
  END IF;
  
  -- Validate event types if provided
  IF p_event_types IS NOT NULL AND NOT (p_event_types <@ v_valid_events) THEN
    RAISE EXCEPTION 'Invalid event type(s) specified';
  END IF;
  
  -- Update
  UPDATE outbound_webhooks SET
    name = COALESCE(p_name, name),
    url = COALESCE(p_url, url),
    event_types = COALESCE(p_event_types::webhook_event_type[], event_types),
    is_active = COALESCE(p_is_active, is_active),
    updated_at = now()
  WHERE id = p_id;
  
  RETURN true;
END;
$$;