CREATE OR REPLACE FUNCTION public.simulate_ticket_escalation_policy(
  p_brand_id uuid,
  p_level_1_minutes integer,
  p_level_2_minutes integer,
  p_level_3_minutes integer,
  p_from_days integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_internal_user_id uuid;
  v_authorized boolean := false;
  v_from_ts timestamptz;
  v_result jsonb;
  v_simulated jsonb;
  v_actual jsonb;
  v_total_tickets integer;
  v_avg_resolution_minutes numeric;
BEGIN
  -- Validate inputs
  IF p_level_1_minutes <= 0 OR p_level_2_minutes <= 0 OR p_level_3_minutes <= 0 THEN
    RAISE EXCEPTION 'Level minutes must be positive' USING ERRCODE = '22023';
  END IF;
  IF p_level_1_minutes >= p_level_2_minutes OR p_level_2_minutes >= p_level_3_minutes THEN
    RAISE EXCEPTION 'Levels must be strictly increasing (L1 < L2 < L3)' USING ERRCODE = '22023';
  END IF;
  IF p_from_days < 1 OR p_from_days > 180 THEN
    RAISE EXCEPTION 'from_days must be between 1 and 180' USING ERRCODE = '22023';
  END IF;

  -- Auth: get internal user id
  v_internal_user_id := public.get_user_id(auth.uid());
  IF v_internal_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Authorization: admin/ceo on the specific brand OR system admin
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = v_internal_user_id
      AND ur.is_active = true
      AND ur.role IN ('admin', 'ceo')
      AND (
        ur.brand_id = p_brand_id
        OR ur.brand_id = '00000000-0000-0000-0000-000000000000'::uuid
      )
  ) INTO v_authorized;

  IF NOT v_authorized THEN
    RAISE EXCEPTION 'Insufficient privileges' USING ERRCODE = '42501';
  END IF;

  v_from_ts := now() - (p_from_days || ' days')::interval;

  -- Build per-ticket simulated level on tickets with SLA breach in window
  WITH base AS (
    SELECT
      t.id,
      t.escalation_level AS actual_level,
      t.sla_breached_at,
      COALESCE(t.resolved_at, t.closed_at, now()) AS effective_end,
      EXTRACT(EPOCH FROM (COALESCE(t.resolved_at, t.closed_at, now()) - t.sla_breached_at)) / 60.0 AS minutes_after_breach
    FROM public.tickets t
    WHERE t.brand_id = p_brand_id
      AND t.sla_breached_at IS NOT NULL
      AND t.sla_breached_at >= v_from_ts
      AND t.archived = false
  ),
  scored AS (
    SELECT
      id,
      actual_level,
      CASE
        WHEN minutes_after_breach >= p_level_3_minutes THEN 3
        WHEN minutes_after_breach >= p_level_2_minutes THEN 2
        WHEN minutes_after_breach >= p_level_1_minutes THEN 1
        ELSE 0
      END AS simulated_level,
      minutes_after_breach
    FROM base
  )
  SELECT
    jsonb_build_object(
      'level_0', COUNT(*) FILTER (WHERE simulated_level = 0),
      'level_1', COUNT(*) FILTER (WHERE simulated_level = 1),
      'level_2', COUNT(*) FILTER (WHERE simulated_level = 2),
      'level_3', COUNT(*) FILTER (WHERE simulated_level = 3)
    ),
    jsonb_build_object(
      'level_0', COUNT(*) FILTER (WHERE actual_level = 0),
      'level_1', COUNT(*) FILTER (WHERE actual_level = 1),
      'level_2', COUNT(*) FILTER (WHERE actual_level = 2),
      'level_3', COUNT(*) FILTER (WHERE actual_level >= 3)
    ),
    COUNT(*),
    ROUND(AVG(minutes_after_breach)::numeric, 1)
  INTO v_simulated, v_actual, v_total_tickets, v_avg_resolution_minutes
  FROM scored;

  v_result := jsonb_build_object(
    'simulated', COALESCE(v_simulated, '{}'::jsonb),
    'actual', COALESCE(v_actual, '{}'::jsonb),
    'total_tickets', COALESCE(v_total_tickets, 0),
    'avg_minutes_after_breach', COALESCE(v_avg_resolution_minutes, 0),
    'thresholds', jsonb_build_object(
      'level_1_minutes', p_level_1_minutes,
      'level_2_minutes', p_level_2_minutes,
      'level_3_minutes', p_level_3_minutes
    ),
    'from_days', p_from_days,
    'brand_id', p_brand_id,
    'computed_at', now()
  );

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.simulate_ticket_escalation_policy(uuid, integer, integer, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.simulate_ticket_escalation_policy(uuid, integer, integer, integer, integer) TO authenticated;