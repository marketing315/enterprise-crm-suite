-- Audit-of-audit: list & summary RPC for audit access log
CREATE OR REPLACE FUNCTION public.get_audit_access_log(
  p_brand_id uuid,
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL,
  p_access_type text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from timestamptz := COALESCE(p_date_from, now() - interval '30 days');
  v_to   timestamptz := COALESCE(p_date_to, now());
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
  v_total integer;
  v_events jsonb;
  v_by_type jsonb;
  v_by_user jsonb;
BEGIN
  -- Admin-only
  IF NOT public.is_audit_admin(auth.uid()) THEN
    RAISE EXCEPTION 'access denied: audit admin required';
  END IF;

  -- Total
  SELECT COUNT(*) INTO v_total
  FROM public.audit_access_log al
  WHERE (p_brand_id IS NULL OR al.brand_id = p_brand_id)
    AND al.accessed_at >= v_from
    AND al.accessed_at <= v_to
    AND (p_access_type IS NULL OR al.access_type = p_access_type)
    AND (p_user_id IS NULL OR al.accessed_by = p_user_id);

  -- Page of events
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.accessed_at DESC), '[]'::jsonb)
  INTO v_events
  FROM (
    SELECT al.id, al.brand_id, al.accessed_by, al.accessed_by_display_name,
           al.access_type, al.filters, al.result_count, al.reason,
           al.user_agent, al.accessed_at
    FROM public.audit_access_log al
    WHERE (p_brand_id IS NULL OR al.brand_id = p_brand_id)
      AND al.accessed_at >= v_from
      AND al.accessed_at <= v_to
      AND (p_access_type IS NULL OR al.access_type = p_access_type)
      AND (p_user_id IS NULL OR al.accessed_by = p_user_id)
    ORDER BY al.accessed_at DESC
    LIMIT v_limit OFFSET v_offset
  ) t;

  -- Aggregate: by access_type
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.count DESC), '[]'::jsonb)
  INTO v_by_type
  FROM (
    SELECT al.access_type, COUNT(*)::int AS count
    FROM public.audit_access_log al
    WHERE (p_brand_id IS NULL OR al.brand_id = p_brand_id)
      AND al.accessed_at >= v_from
      AND al.accessed_at <= v_to
    GROUP BY al.access_type
  ) t;

  -- Aggregate: top users (max 10)
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.count DESC), '[]'::jsonb)
  INTO v_by_user
  FROM (
    SELECT al.accessed_by AS user_id,
           MAX(al.accessed_by_display_name) AS display_name,
           COUNT(*)::int AS count,
           MAX(al.accessed_at) AS last_access_at
    FROM public.audit_access_log al
    WHERE (p_brand_id IS NULL OR al.brand_id = p_brand_id)
      AND al.accessed_at >= v_from
      AND al.accessed_at <= v_to
    GROUP BY al.accessed_by
    ORDER BY count DESC
    LIMIT 10
  ) t;

  RETURN jsonb_build_object(
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'events', v_events,
    'by_access_type', v_by_type,
    'top_users', v_by_user,
    'date_from', v_from,
    'date_to', v_to
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_audit_access_log(uuid, timestamptz, timestamptz, text, uuid, integer, integer) TO authenticated;