-- Fix: replace user_brand_roles with user_roles in all webhook RPCs

-- Drop and recreate list_outbound_webhooks
DROP FUNCTION IF EXISTS public.list_outbound_webhooks(uuid);
CREATE OR REPLACE FUNCTION public.list_outbound_webhooks(p_brand_id uuid)
RETURNS TABLE(
  id uuid,
  name text,
  url text,
  is_active boolean,
  event_types text[],
  payload_format text,
  payload_mapping jsonb,
  custom_url_params jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  -- Verify user has admin role for this brand
  IF NOT EXISTS (
    SELECT 1 FROM user_roles
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

-- Drop and recreate create_outbound_webhook
DROP FUNCTION IF EXISTS public.create_outbound_webhook(uuid, text, text, text, text[], boolean, text, jsonb, jsonb);
CREATE OR REPLACE FUNCTION public.create_outbound_webhook(
  p_brand_id uuid,
  p_name text,
  p_url text,
  p_secret text,
  p_event_types text[],
  p_is_active boolean DEFAULT true,
  p_payload_format text DEFAULT 'json',
  p_payload_mapping jsonb DEFAULT NULL,
  p_custom_url_params jsonb DEFAULT NULL
)
RETURNS TABLE(webhook_id uuid, secret text)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_webhook_id uuid;
BEGIN
  -- Verify user has admin role for this brand
  IF NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND brand_id = p_brand_id
    AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  -- Insert the webhook
  INSERT INTO outbound_webhooks (
    brand_id, name, url, secret_encrypted, event_types, is_active,
    payload_format, payload_mapping, custom_url_params
  )
  VALUES (
    p_brand_id, p_name, p_url,
    extensions.crypt(p_secret, extensions.gen_salt('bf')),
    p_event_types, p_is_active,
    p_payload_format, p_payload_mapping, p_custom_url_params
  )
  RETURNING id INTO v_webhook_id;

  RETURN QUERY SELECT v_webhook_id, p_secret;
END;
$$;

-- Drop and recreate update_outbound_webhook
DROP FUNCTION IF EXISTS public.update_outbound_webhook(uuid, text, text, text[], boolean, text, jsonb, jsonb);
CREATE OR REPLACE FUNCTION public.update_outbound_webhook(
  p_id uuid,
  p_name text DEFAULT NULL,
  p_url text DEFAULT NULL,
  p_event_types text[] DEFAULT NULL,
  p_is_active boolean DEFAULT NULL,
  p_payload_format text DEFAULT NULL,
  p_payload_mapping jsonb DEFAULT NULL,
  p_custom_url_params jsonb DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_brand_id uuid;
BEGIN
  -- Get brand_id for this webhook
  SELECT brand_id INTO v_brand_id FROM outbound_webhooks WHERE id = p_id;
  
  IF v_brand_id IS NULL THEN
    RAISE EXCEPTION 'Webhook not found';
  END IF;

  -- Verify user has admin role for this brand
  IF NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND brand_id = v_brand_id
    AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  -- Update the webhook
  UPDATE outbound_webhooks
  SET
    name = COALESCE(p_name, name),
    url = COALESCE(p_url, url),
    event_types = COALESCE(p_event_types, event_types),
    is_active = COALESCE(p_is_active, is_active),
    payload_format = COALESCE(p_payload_format, payload_format),
    payload_mapping = CASE WHEN p_payload_mapping IS NOT NULL THEN p_payload_mapping ELSE payload_mapping END,
    custom_url_params = CASE WHEN p_custom_url_params IS NOT NULL THEN p_custom_url_params ELSE custom_url_params END,
    updated_at = now()
  WHERE id = p_id;

  RETURN true;
END;
$$;