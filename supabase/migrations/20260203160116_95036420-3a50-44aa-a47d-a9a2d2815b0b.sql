-- M14: Drop and recreate list_outbound_webhooks with payload_format fields

DO $$
BEGIN
  -- Drop all overloads of list_outbound_webhooks
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'list_outbound_webhooks') THEN
    DROP FUNCTION IF EXISTS list_outbound_webhooks(UUID) CASCADE;
  END IF;
END $$;

CREATE FUNCTION list_outbound_webhooks(p_brand_id UUID)
RETURNS TABLE(
  id UUID,
  name TEXT,
  url TEXT,
  is_active BOOLEAN,
  event_types TEXT[],
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
DECLARE
  v_user_id UUID := get_user_id(auth.uid());
BEGIN
  IF NOT user_belongs_to_brand(v_user_id, p_brand_id) THEN
    RAISE EXCEPTION 'Access denied';
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