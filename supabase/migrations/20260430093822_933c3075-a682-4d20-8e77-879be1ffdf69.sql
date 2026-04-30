CREATE OR REPLACE FUNCTION public.get_ai_decisions_drilldown(
  p_brand_id uuid DEFAULT NULL,
  p_days integer DEFAULT 30,
  p_model_version text DEFAULT NULL,
  p_initial_stage text DEFAULT NULL,
  p_overridden_by_user_id uuid DEFAULT NULL,
  p_only_overridden boolean DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_total integer := 0;
  v_rows jsonb;
  v_lim integer;
  v_off integer;
BEGIN
  v_user_id := get_user_id(auth.uid());
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  -- Reuse the same permission shape as get_ai_override_summary
  IF p_brand_id IS NOT NULL THEN
    IF NOT (
      has_role(v_user_id, 'ceo'::app_role)
      OR has_role_for_brand(v_user_id, p_brand_id, 'admin'::app_role)
      OR has_role_for_brand(v_user_id, p_brand_id, 'responsabile_venditori'::app_role)
      OR has_role_for_brand(v_user_id, p_brand_id, 'responsabile_callcenter'::app_role)
    ) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  ELSE
    IF NOT has_role(v_user_id, 'ceo'::app_role) AND NOT has_role(v_user_id, 'admin'::app_role) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  v_lim := LEAST(GREATEST(p_limit, 1), 200);
  v_off := GREATEST(p_offset, 0);

  -- Total matching count (for pagination)
  SELECT COUNT(*)
  INTO v_total
  FROM ai_decision_logs l
  WHERE l.created_at >= now() - (p_days || ' days')::interval
    AND (p_brand_id IS NULL OR l.brand_id = p_brand_id)
    AND (p_model_version IS NULL OR l.model_version = p_model_version)
    AND (p_initial_stage IS NULL OR l.initial_stage_name = p_initial_stage)
    AND (p_overridden_by_user_id IS NULL OR l.overridden_by_user_id = p_overridden_by_user_id)
    AND (p_only_overridden IS NULL OR l.was_overridden = p_only_overridden);

  -- Page of rows with denormalized labels
  SELECT COALESCE(jsonb_agg(row_to_jsonb(r) ORDER BY r.created_at DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      l.id,
      l.brand_id,
      b.name AS brand_name,
      l.lead_event_id,
      l.lead_type,
      l.priority,
      l.initial_stage_name,
      l.model_version,
      l.prompt_version,
      l.confidence,
      l.was_overridden,
      l.override_reason,
      l.override_reason_category::text AS override_reason_category,
      l.overridden_at,
      l.overridden_by_user_id,
      u.full_name AS overridden_by_name,
      l.tags_to_apply,
      l.should_create_ticket,
      l.should_create_or_update_appointment,
      l.appointment_action,
      l.rationale,
      l.created_at
    FROM ai_decision_logs l
    LEFT JOIN brands b ON b.id = l.brand_id
    LEFT JOIN users u ON u.id = l.overridden_by_user_id
    WHERE l.created_at >= now() - (p_days || ' days')::interval
      AND (p_brand_id IS NULL OR l.brand_id = p_brand_id)
      AND (p_model_version IS NULL OR l.model_version = p_model_version)
      AND (p_initial_stage IS NULL OR l.initial_stage_name = p_initial_stage)
      AND (p_overridden_by_user_id IS NULL OR l.overridden_by_user_id = p_overridden_by_user_id)
      AND (p_only_overridden IS NULL OR l.was_overridden = p_only_overridden)
    ORDER BY l.created_at DESC
    LIMIT v_lim OFFSET v_off
  ) r;

  RETURN jsonb_build_object(
    'total', v_total,
    'limit', v_lim,
    'offset', v_off,
    'rows', v_rows,
    'generated_at', now()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_ai_decisions_drilldown(uuid, integer, text, text, uuid, boolean, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_ai_decisions_drilldown(uuid, integer, text, text, uuid, boolean, integer, integer) TO authenticated;

-- Filter options helpers (distinct lists for dropdowns) — same permission gate
CREATE OR REPLACE FUNCTION public.get_ai_decisions_filter_options(
  p_brand_id uuid DEFAULT NULL,
  p_days integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_models jsonb;
  v_stages jsonb;
  v_users jsonb;
BEGIN
  v_user_id := get_user_id(auth.uid());
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;

  IF p_brand_id IS NOT NULL THEN
    IF NOT (
      has_role(v_user_id, 'ceo'::app_role)
      OR has_role_for_brand(v_user_id, p_brand_id, 'admin'::app_role)
      OR has_role_for_brand(v_user_id, p_brand_id, 'responsabile_venditori'::app_role)
      OR has_role_for_brand(v_user_id, p_brand_id, 'responsabile_callcenter'::app_role)
    ) THEN RAISE EXCEPTION 'forbidden'; END IF;
  ELSE
    IF NOT has_role(v_user_id, 'ceo'::app_role) AND NOT has_role(v_user_id, 'admin'::app_role) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  SELECT COALESCE(jsonb_agg(DISTINCT model_version), '[]'::jsonb)
  INTO v_models
  FROM ai_decision_logs
  WHERE created_at >= now() - (p_days || ' days')::interval
    AND (p_brand_id IS NULL OR brand_id = p_brand_id);

  SELECT COALESCE(jsonb_agg(DISTINCT initial_stage_name) FILTER (WHERE initial_stage_name IS NOT NULL), '[]'::jsonb)
  INTO v_stages
  FROM ai_decision_logs
  WHERE created_at >= now() - (p_days || ' days')::interval
    AND (p_brand_id IS NULL OR brand_id = p_brand_id);

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', u.id, 'name', u.full_name) ORDER BY u.full_name), '[]'::jsonb)
  INTO v_users
  FROM (
    SELECT DISTINCT u.id, u.full_name
    FROM ai_decision_logs l
    JOIN users u ON u.id = l.overridden_by_user_id
    WHERE l.was_overridden = true
      AND l.created_at >= now() - (p_days || ' days')::interval
      AND (p_brand_id IS NULL OR l.brand_id = p_brand_id)
    LIMIT 200
  ) u;

  RETURN jsonb_build_object('models', v_models, 'stages', v_stages, 'users', v_users);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_ai_decisions_filter_options(uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_ai_decisions_filter_options(uuid, integer) TO authenticated;