-- Fix: event_types column return type must match the actual table type (webhook_event_type[])

-- Drop and recreate list_outbound_webhooks with correct return type
DROP FUNCTION IF EXISTS public.list_outbound_webhooks(uuid);
CREATE OR REPLACE FUNCTION public.list_outbound_webhooks(p_brand_id uuid)
RETURNS TABLE(
  id uuid,
  name text,
  url text,
  is_active boolean,
  event_types webhook_event_type[],
  payload_format text,
  payload_mapping jsonb,
  custom_url_params jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Get the internal user_id from the supabase_auth_id
  SELECT u.id INTO v_user_id 
  FROM users u 
  WHERE u.supabase_auth_id = auth.uid();

  -- Verify user has admin or ceo role for this brand
  IF NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = v_user_id
    AND brand_id = p_brand_id
    AND role IN ('admin', 'ceo')
  ) THEN
    RAISE EXCEPTION 'Access denied: admin or ceo role required';
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