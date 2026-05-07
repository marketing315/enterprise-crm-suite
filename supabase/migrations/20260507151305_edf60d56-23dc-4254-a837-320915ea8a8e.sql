-- =====================================================================
-- SPRINT 4b: Ticket assignment race + SLA breach dedup
-- =====================================================================

-- 1) assign_ticket RPC with optimistic version check + brand guard
CREATE OR REPLACE FUNCTION public.assign_ticket(
  p_ticket_id uuid,
  p_assignee_user_id uuid,           -- NULL = unassign
  p_expected_version integer DEFAULT NULL
)
RETURNS TABLE(ticket_id uuid, assigned_to_user_id uuid, new_version integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand_id uuid;
  v_current_version integer;
  v_current_assignee uuid;
  v_actor_user_id uuid;
  v_new_version integer;
BEGIN
  -- Lock the ticket row to serialize concurrent assignment attempts
  SELECT brand_id, COALESCE(version, 0), assigned_to_user_id
    INTO v_brand_id, v_current_version, v_current_assignee
  FROM public.tickets
  WHERE id = p_ticket_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TICKET_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Brand access guard (multi-tenant)
  PERFORM public.assert_brand_access(v_brand_id);

  -- Validate assignee exists and is in same brand (when provided)
  IF p_assignee_user_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = p_assignee_user_id
        AND (u.brand_id = v_brand_id OR u.brand_id = '00000000-0000-0000-0000-000000000000'::uuid)
    ) THEN
      RAISE EXCEPTION 'ASSIGNEE_NOT_FOUND_OR_WRONG_BRAND' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Optimistic concurrency check
  IF p_expected_version IS NOT NULL AND p_expected_version <> v_current_version THEN
    RAISE EXCEPTION 'STALE_TICKET: expected version % but found %', p_expected_version, v_current_version
      USING ERRCODE = '40001';
  END IF;

  -- No-op if already assigned to same user
  IF v_current_assignee IS NOT DISTINCT FROM p_assignee_user_id THEN
    RETURN QUERY SELECT p_ticket_id, v_current_assignee, v_current_version;
    RETURN;
  END IF;

  -- Resolve actor (assigner) from JWT
  v_actor_user_id := public.get_user_id(auth.uid());

  UPDATE public.tickets
     SET assigned_to_user_id = p_assignee_user_id,
         assigned_by_user_id = CASE WHEN p_assignee_user_id IS NULL THEN NULL ELSE v_actor_user_id END,
         assigned_at         = CASE WHEN p_assignee_user_id IS NULL THEN NULL ELSE now() END
   WHERE id = p_ticket_id
   RETURNING COALESCE(version, v_current_version + 1) INTO v_new_version;

  RETURN QUERY SELECT p_ticket_id, p_assignee_user_id, v_new_version;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assign_ticket(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_ticket(uuid, uuid, integer) TO authenticated;

-- 2) SLA breach dedup: FOR UPDATE SKIP LOCKED + re-check inside UPDATE
CREATE OR REPLACE FUNCTION public.check_and_mark_sla_breaches(p_brand_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sla_thresholds jsonb;
  v_breached_count integer := 0;
  v_ticket RECORD;
  v_updated_id uuid;
BEGIN
  SELECT sla_thresholds_minutes INTO v_sla_thresholds
  FROM brands
  WHERE id = p_brand_id;

  IF v_sla_thresholds IS NULL THEN
    RETURN 0;
  END IF;

  -- Lock candidate rows; SKIP LOCKED so concurrent runs don't contend
  FOR v_ticket IN
    SELECT t.id, t.priority, t.opened_at
    FROM tickets t
    WHERE t.brand_id = p_brand_id
      AND t.status IN ('open', 'in_progress', 'reopened')
      AND t.sla_breached_at IS NULL
      AND (
        EXTRACT(EPOCH FROM (now() - t.opened_at)) / 60 >
        COALESCE((v_sla_thresholds->>t.priority::text)::numeric, 1440)
      )
    FOR UPDATE OF t SKIP LOCKED
  LOOP
    -- Idempotent UPDATE: only acts if still unset (defensive even with row lock)
    UPDATE tickets
       SET sla_breached_at = now()
     WHERE id = v_ticket.id
       AND sla_breached_at IS NULL
    RETURNING id INTO v_updated_id;

    IF v_updated_id IS NOT NULL THEN
      INSERT INTO ticket_audit_logs (brand_id, ticket_id, action_type, new_value, metadata)
      VALUES (
        p_brand_id,
        v_ticket.id,
        'sla_breach',
        jsonb_build_object('priority', v_ticket.priority, 'age_minutes',
          ROUND(EXTRACT(EPOCH FROM (now() - v_ticket.opened_at)) / 60)),
        jsonb_build_object(
          'threshold_minutes', (v_sla_thresholds->>v_ticket.priority::text)::integer,
          'detected_at', now()
        )
      );
      v_breached_count := v_breached_count + 1;
    END IF;
  END LOOP;

  RETURN v_breached_count;
END;
$function$;
