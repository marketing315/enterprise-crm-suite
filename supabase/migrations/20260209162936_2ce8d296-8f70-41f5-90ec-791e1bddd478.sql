
-- Drop ALL overloads of list_webhook_deliveries then recreate a single clean version
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT oid::regprocedure::text AS sig
    FROM pg_proc
    WHERE proname = 'list_webhook_deliveries'
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION ' || r.sig || ' CASCADE';
  END LOOP;
END $$;

-- Recreate single version with text p_status (no enum ambiguity)
CREATE OR REPLACE FUNCTION public.list_webhook_deliveries(
  p_brand_id uuid,
  p_webhook_id uuid DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_event_type text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand_ids uuid[];
  v_result json;
  v_total bigint;
BEGIN
  -- Resolve system brand to all user-accessible brands
  IF p_brand_id = '00000000-0000-0000-0000-000000000000' THEN
    SELECT array_agg(ur.brand_id)
    INTO v_brand_ids
    FROM user_roles ur
    WHERE ur.user_id = (
      SELECT u.id FROM users u WHERE u.supabase_auth_id = auth.uid()
    )
    AND ur.is_active = true
    AND ur.brand_id != '00000000-0000-0000-0000-000000000000';
  ELSE
    v_brand_ids := ARRAY[p_brand_id];
  END IF;

  IF v_brand_ids IS NULL OR array_length(v_brand_ids, 1) IS NULL THEN
    RETURN json_build_object(
      'deliveries', '[]'::json,
      'total_count', 0,
      'limit', p_limit,
      'offset', p_offset
    );
  END IF;

  -- Count total
  SELECT count(*)
  INTO v_total
  FROM webhook_deliveries wd
  JOIN outbound_webhooks ow ON ow.id = wd.webhook_id
  WHERE ow.brand_id = ANY(v_brand_ids)
    AND (p_webhook_id IS NULL OR wd.webhook_id = p_webhook_id)
    AND (p_status IS NULL OR wd.status::text = p_status)
    AND (p_event_type IS NULL OR wd.event_type = p_event_type);

  -- Build result
  SELECT json_build_object(
    'deliveries', COALESCE(json_agg(row_to_json(t)), '[]'::json),
    'total_count', v_total,
    'limit', p_limit,
    'offset', p_offset
  )
  INTO v_result
  FROM (
    SELECT
      wd.id,
      wd.webhook_id,
      ow.name AS webhook_name,
      wd.event_type,
      wd.event_id,
      wd.status::text AS status,
      wd.attempt_count,
      wd.max_attempts,
      wd.next_attempt_at,
      wd.response_status,
      wd.last_error,
      wd.created_at,
      wd.updated_at
    FROM webhook_deliveries wd
    JOIN outbound_webhooks ow ON ow.id = wd.webhook_id
    WHERE ow.brand_id = ANY(v_brand_ids)
      AND (p_webhook_id IS NULL OR wd.webhook_id = p_webhook_id)
      AND (p_status IS NULL OR wd.status::text = p_status)
      AND (p_event_type IS NULL OR wd.event_type = p_event_type)
    ORDER BY wd.created_at DESC
    LIMIT p_limit
    OFFSET p_offset
  ) t;

  RETURN v_result;
END;
$$;
