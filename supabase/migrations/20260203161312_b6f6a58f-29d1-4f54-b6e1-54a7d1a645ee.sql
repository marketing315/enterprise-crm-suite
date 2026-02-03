-- Add payload format and mapping columns to outbound_webhooks
ALTER TABLE public.outbound_webhooks 
  ADD COLUMN IF NOT EXISTS payload_format TEXT NOT NULL DEFAULT 'json' CHECK (payload_format IN ('json', 'form_urlencoded')),
  ADD COLUMN IF NOT EXISTS payload_mapping JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS custom_url_params JSONB DEFAULT NULL;

-- Update create_outbound_webhook RPC to support new fields
DROP FUNCTION IF EXISTS public.create_outbound_webhook(UUID, TEXT, TEXT, TEXT, webhook_event_type[], BOOLEAN);
CREATE OR REPLACE FUNCTION public.create_outbound_webhook(
  p_brand_id UUID,
  p_name TEXT,
  p_url TEXT,
  p_secret TEXT,
  p_event_types webhook_event_type[],
  p_is_active BOOLEAN DEFAULT true,
  p_payload_format TEXT DEFAULT 'json',
  p_payload_mapping JSONB DEFAULT NULL,
  p_custom_url_params JSONB DEFAULT NULL
)
RETURNS TABLE(webhook_id UUID, secret TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_webhook_id UUID;
BEGIN
  -- Verify user has admin role for this brand
  IF NOT EXISTS (
    SELECT 1 FROM user_brand_roles
    WHERE user_id = auth.uid()
    AND brand_id = p_brand_id
    AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  -- Validate payload_format
  IF p_payload_format NOT IN ('json', 'form_urlencoded') THEN
    RAISE EXCEPTION 'Invalid payload_format. Must be json or form_urlencoded';
  END IF;

  -- Insert webhook
  INSERT INTO outbound_webhooks (
    brand_id, name, url, secret, event_types, is_active,
    payload_format, payload_mapping, custom_url_params
  )
  VALUES (
    p_brand_id, p_name, p_url, p_secret, p_event_types, p_is_active,
    p_payload_format, p_payload_mapping, p_custom_url_params
  )
  RETURNING id INTO v_webhook_id;

  RETURN QUERY SELECT v_webhook_id, p_secret;
END;
$$;

-- Update update_outbound_webhook RPC
DROP FUNCTION IF EXISTS public.update_outbound_webhook(UUID, TEXT, TEXT, webhook_event_type[], BOOLEAN);
CREATE OR REPLACE FUNCTION public.update_outbound_webhook(
  p_id UUID,
  p_name TEXT DEFAULT NULL,
  p_url TEXT DEFAULT NULL,
  p_event_types webhook_event_type[] DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT NULL,
  p_payload_format TEXT DEFAULT NULL,
  p_payload_mapping JSONB DEFAULT NULL,
  p_custom_url_params JSONB DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand_id UUID;
BEGIN
  -- Get webhook's brand_id
  SELECT brand_id INTO v_brand_id FROM outbound_webhooks WHERE id = p_id;
  
  IF v_brand_id IS NULL THEN
    RAISE EXCEPTION 'Webhook not found';
  END IF;

  -- Verify user has admin role for this brand
  IF NOT EXISTS (
    SELECT 1 FROM user_brand_roles
    WHERE user_id = auth.uid()
    AND brand_id = v_brand_id
    AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  -- Validate payload_format if provided
  IF p_payload_format IS NOT NULL AND p_payload_format NOT IN ('json', 'form_urlencoded') THEN
    RAISE EXCEPTION 'Invalid payload_format. Must be json or form_urlencoded';
  END IF;

  -- Update webhook
  UPDATE outbound_webhooks
  SET
    name = COALESCE(p_name, name),
    url = COALESCE(p_url, url),
    event_types = COALESCE(p_event_types, event_types),
    is_active = COALESCE(p_is_active, is_active),
    payload_format = COALESCE(p_payload_format, payload_format),
    payload_mapping = CASE WHEN p_payload_mapping IS NULL THEN payload_mapping ELSE p_payload_mapping END,
    custom_url_params = CASE WHEN p_custom_url_params IS NULL THEN custom_url_params ELSE p_custom_url_params END,
    updated_at = now()
  WHERE id = p_id;

  RETURN TRUE;
END;
$$;

-- Update list_outbound_webhooks RPC to return new fields
DROP FUNCTION IF EXISTS public.list_outbound_webhooks(UUID);
CREATE OR REPLACE FUNCTION public.list_outbound_webhooks(p_brand_id UUID)
RETURNS TABLE(
  id UUID,
  name TEXT,
  url TEXT,
  is_active BOOLEAN,
  event_types webhook_event_type[],
  payload_format TEXT,
  payload_mapping JSONB,
  custom_url_params JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify user has admin role for this brand
  IF NOT EXISTS (
    SELECT 1 FROM user_brand_roles
    WHERE user_id = auth.uid()
    AND brand_id = p_brand_id
    AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  RETURN QUERY
  SELECT 
    w.id, w.name, w.url, w.is_active, w.event_types,
    w.payload_format, w.payload_mapping, w.custom_url_params,
    w.created_at, w.updated_at
  FROM outbound_webhooks w
  WHERE w.brand_id = p_brand_id
  ORDER BY w.created_at DESC;
END;
$$;