-- =====================================================================
-- SPRINT 4a: Kanban optimistic concurrency + Appointment slot unique
-- =====================================================================

-- 1) move_deal_stage RPC with optimistic version check
CREATE OR REPLACE FUNCTION public.move_deal_stage(
  p_deal_id uuid,
  p_stage_id uuid,
  p_expected_version integer DEFAULT NULL
)
RETURNS TABLE(deal_id uuid, new_stage_id uuid, new_version integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand_id uuid;
  v_current_stage uuid;
  v_current_version integer;
  v_new_version integer;
BEGIN
  -- Lock the deal row to serialize concurrent moves on same deal
  SELECT brand_id, current_stage_id, COALESCE(version, 0)
    INTO v_brand_id, v_current_stage, v_current_version
  FROM public.deals
  WHERE id = p_deal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DEAL_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Brand access guard (multi-tenant)
  PERFORM public.assert_brand_access(v_brand_id);

  -- Validate target stage exists
  IF NOT EXISTS (SELECT 1 FROM public.pipeline_stages WHERE id = p_stage_id) THEN
    RAISE EXCEPTION 'STAGE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Optimistic concurrency check
  IF p_expected_version IS NOT NULL AND p_expected_version <> v_current_version THEN
    RAISE EXCEPTION 'STALE_DEAL: expected version % but found %', p_expected_version, v_current_version
      USING ERRCODE = '40001';
  END IF;

  -- No-op if already at target stage
  IF v_current_stage = p_stage_id THEN
    RETURN QUERY SELECT p_deal_id, p_stage_id, v_current_version;
    RETURN;
  END IF;

  -- Apply update; rely on existing version trigger (A7) to bump version + updated_at
  UPDATE public.deals
     SET current_stage_id = p_stage_id
   WHERE id = p_deal_id
   RETURNING COALESCE(version, v_current_version + 1) INTO v_new_version;

  RETURN QUERY SELECT p_deal_id, p_stage_id, v_new_version;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.move_deal_stage(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.move_deal_stage(uuid, uuid, integer) TO authenticated;

-- 2) Appointments slot uniqueness (partial unique index)
-- Prevents same sales user from having two ACTIVE appointments at same scheduled_at.
-- Excludes cancelled / no_show / rescheduled to allow legitimate replacements.
CREATE UNIQUE INDEX IF NOT EXISTS uq_appointments_sales_slot_active
  ON public.appointments (assigned_sales_user_id, scheduled_at)
  WHERE assigned_sales_user_id IS NOT NULL
    AND status NOT IN ('cancelled','no_show','rescheduled');
