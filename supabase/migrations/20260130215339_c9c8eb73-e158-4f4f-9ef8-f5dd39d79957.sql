-- =============================================
-- Advanced Notification Management RPCs
-- =============================================

-- Add DELETE policy on notifications table (currently missing)
CREATE POLICY "Users can delete their notifications"
ON public.notifications
FOR DELETE
USING (user_id = get_user_id(auth.uid()));

-- =============================================
-- RPC: Mark all notifications as read
-- =============================================
CREATE OR REPLACE FUNCTION public.mark_all_notifications_read(p_brand_id uuid DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_count INTEGER;
BEGIN
  SELECT u.id INTO v_user_id FROM public.users u WHERE u.supabase_auth_id = auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE notifications
  SET read_at = now()
  WHERE user_id = v_user_id
    AND read_at IS NULL
    AND (p_brand_id IS NULL OR brand_id = p_brand_id);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- =============================================
-- RPC: Delete specific notifications
-- =============================================
CREATE OR REPLACE FUNCTION public.delete_notifications(p_notification_ids uuid[])
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_count INTEGER;
BEGIN
  SELECT u.id INTO v_user_id FROM public.users u WHERE u.supabase_auth_id = auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  DELETE FROM notifications
  WHERE id = ANY(p_notification_ids)
    AND user_id = v_user_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- =============================================
-- RPC: Delete all read notifications
-- =============================================
CREATE OR REPLACE FUNCTION public.delete_read_notifications(p_brand_id uuid DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_count INTEGER;
BEGIN
  SELECT u.id INTO v_user_id FROM public.users u WHERE u.supabase_auth_id = auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  DELETE FROM notifications
  WHERE user_id = v_user_id
    AND read_at IS NOT NULL
    AND (p_brand_id IS NULL OR brand_id = p_brand_id);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- =============================================
-- RPC: Get notification preferences for a brand
-- =============================================
CREATE OR REPLACE FUNCTION public.get_notification_preferences(p_brand_id uuid)
RETURNS TABLE(
  id uuid,
  user_id uuid,
  brand_id uuid,
  notification_type text,
  enabled boolean,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT u.id INTO v_user_id FROM public.users u WHERE u.supabase_auth_id = auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NOT user_belongs_to_brand(v_user_id, p_brand_id) THEN
    RAISE EXCEPTION 'Forbidden: no access to brand';
  END IF;

  RETURN QUERY
  SELECT 
    np.id,
    np.user_id,
    np.brand_id,
    np.notification_type::text,
    np.enabled,
    np.created_at
  FROM notification_preferences np
  WHERE np.user_id = v_user_id
    AND np.brand_id = p_brand_id;
END;
$$;

-- =============================================
-- RPC: Upsert notification preference
-- =============================================
CREATE OR REPLACE FUNCTION public.upsert_notification_preference(
  p_brand_id uuid,
  p_notification_type text,
  p_enabled boolean
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_result json;
BEGIN
  SELECT u.id INTO v_user_id FROM public.users u WHERE u.supabase_auth_id = auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NOT user_belongs_to_brand(v_user_id, p_brand_id) THEN
    RAISE EXCEPTION 'Forbidden: no access to brand';
  END IF;

  INSERT INTO notification_preferences (user_id, brand_id, notification_type, enabled)
  VALUES (v_user_id, p_brand_id, p_notification_type::notification_type, p_enabled)
  ON CONFLICT (user_id, brand_id, notification_type)
  DO UPDATE SET enabled = EXCLUDED.enabled
  RETURNING json_build_object(
    'id', id,
    'user_id', user_id,
    'brand_id', brand_id,
    'notification_type', notification_type,
    'enabled', enabled
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- =============================================
-- RPC: Get paginated notifications with filters
-- =============================================
CREATE OR REPLACE FUNCTION public.get_paginated_notifications(
  p_brand_id uuid DEFAULT NULL,
  p_type_filter text DEFAULT NULL,
  p_unread_only boolean DEFAULT FALSE,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_result json;
BEGIN
  SELECT u.id INTO v_user_id FROM public.users u WHERE u.supabase_auth_id = auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  p_limit := LEAST(p_limit, 200);
  p_offset := GREATEST(p_offset, 0);

  WITH filtered AS (
    SELECT 
      n.id,
      n.brand_id,
      n.type::text as type,
      n.title,
      n.body,
      n.entity_type,
      n.entity_id,
      n.read_at,
      n.created_at
    FROM notifications n
    WHERE n.user_id = v_user_id
      AND (p_brand_id IS NULL OR n.brand_id = p_brand_id)
      AND (p_type_filter IS NULL OR n.type::text = p_type_filter)
      AND (NOT p_unread_only OR n.read_at IS NULL)
    ORDER BY n.created_at DESC
    LIMIT p_limit
    OFFSET p_offset
  ),
  total AS (
    SELECT COUNT(*) as cnt
    FROM notifications n
    WHERE n.user_id = v_user_id
      AND (p_brand_id IS NULL OR n.brand_id = p_brand_id)
      AND (p_type_filter IS NULL OR n.type::text = p_type_filter)
      AND (NOT p_unread_only OR n.read_at IS NULL)
  )
  SELECT json_build_object(
    'data', COALESCE((SELECT json_agg(row_to_json(f)) FROM filtered f), '[]'::json),
    'total', (SELECT cnt FROM total),
    'limit', p_limit,
    'offset', p_offset
  ) INTO v_result;

  RETURN v_result;
END;
$$;