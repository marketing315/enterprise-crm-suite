
-- 1) Override reason taxonomy enum
CREATE TYPE public.override_reason_category AS ENUM (
  'wrong_priority',
  'wrong_lead_type',
  'wrong_ticket_decision',
  'wrong_tags',
  'wrong_stage',
  'false_positive',
  'false_negative',
  'other'
);

-- 2) Add category column to ai_decision_logs
ALTER TABLE public.ai_decision_logs
  ADD COLUMN override_reason_category public.override_reason_category DEFAULT NULL;

-- 3) Add confidence_threshold to ai_configs
ALTER TABLE public.ai_configs
  ADD COLUMN confidence_threshold numeric DEFAULT 0.6 CHECK (confidence_threshold >= 0 AND confidence_threshold <= 1);

-- 4) Detailed quality RPC: override by category, confidence distribution, avg triage time
CREATE OR REPLACE FUNCTION public.get_ai_quality_detailed(
  p_brand_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'override_by_category', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'category', cat,
        'count', cnt
      )), '[]'::jsonb)
      FROM (
        SELECT
          COALESCE(override_reason_category::text, 'unspecified') AS cat,
          COUNT(*) AS cnt
        FROM ai_decision_logs
        WHERE brand_id = p_brand_id
          AND created_at BETWEEN p_from AND p_to
          AND was_overridden = true
        GROUP BY override_reason_category
        ORDER BY cnt DESC
      ) sub
    ),
    'confidence_distribution', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'bucket', bucket,
        'count', cnt,
        'override_count', ov_cnt
      )), '[]'::jsonb)
      FROM (
        SELECT
          CASE
            WHEN confidence IS NULL THEN 'N/A'
            WHEN confidence < 0.3 THEN '0-30%'
            WHEN confidence < 0.6 THEN '30-60%'
            WHEN confidence < 0.8 THEN '60-80%'
            ELSE '80-100%'
          END AS bucket,
          COUNT(*) AS cnt,
          COUNT(*) FILTER (WHERE was_overridden = true) AS ov_cnt
        FROM ai_decision_logs
        WHERE brand_id = p_brand_id
          AND created_at BETWEEN p_from AND p_to
        GROUP BY bucket
        ORDER BY bucket
      ) sub
    ),
    'avg_triage_time_minutes', (
      SELECT COALESCE(
        ROUND(AVG(EXTRACT(EPOCH FROM (overridden_at - created_at)) / 60)::numeric, 1),
        0
      )
      FROM ai_decision_logs
      WHERE brand_id = p_brand_id
        AND created_at BETWEEN p_from AND p_to
        AND was_overridden = true
        AND overridden_at IS NOT NULL
    ),
    'low_confidence_count', (
      SELECT COUNT(*)
      FROM ai_decision_logs d
      JOIN ai_configs c ON c.brand_id = d.brand_id
      WHERE d.brand_id = p_brand_id
        AND d.created_at BETWEEN p_from AND p_to
        AND d.confidence IS NOT NULL
        AND d.confidence < c.confidence_threshold
    ),
    'precision_proxy', (
      SELECT CASE
        WHEN COUNT(*) = 0 THEN NULL
        ELSE ROUND(
          (COUNT(*) FILTER (WHERE was_overridden = false))::numeric / COUNT(*) * 100, 1
        )
      END
      FROM ai_decision_logs
      WHERE brand_id = p_brand_id
        AND created_at BETWEEN p_from AND p_to
    ),
    'weekly_override_trend', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'week', week_start,
        'total', total,
        'overridden', overridden,
        'rate', CASE WHEN total > 0 THEN ROUND(overridden::numeric / total * 100, 1) ELSE 0 END
      ) ORDER BY week_start), '[]'::jsonb)
      FROM (
        SELECT
          date_trunc('week', created_at)::date AS week_start,
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE was_overridden = true) AS overridden
        FROM ai_decision_logs
        WHERE brand_id = p_brand_id
          AND created_at BETWEEN p_from AND p_to
        GROUP BY week_start
      ) sub
    )
  ) INTO result;

  RETURN result;
END;
$$;

-- 5) Update override_ai_decision RPC to accept category
CREATE OR REPLACE FUNCTION public.override_ai_decision(
  p_lead_event_id uuid,
  p_new_priority integer DEFAULT NULL,
  p_new_lead_type text DEFAULT NULL,
  p_new_should_create_ticket boolean DEFAULT NULL,
  p_override_reason text DEFAULT NULL,
  p_override_category text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_decision_id uuid;
  v_user_id uuid;
  v_result jsonb;
  v_category public.override_reason_category;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Cast category if provided
  IF p_override_category IS NOT NULL AND p_override_category <> '' THEN
    v_category := p_override_category::public.override_reason_category;
  END IF;

  -- Find the most recent decision for this lead event
  SELECT id INTO v_decision_id
  FROM ai_decision_logs
  WHERE lead_event_id = p_lead_event_id
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_decision_id IS NULL THEN
    RAISE EXCEPTION 'No AI decision found for lead event %', p_lead_event_id;
  END IF;

  -- Save original decision before override
  UPDATE ai_decision_logs SET
    original_decision = CASE
      WHEN original_decision IS NULL THEN
        jsonb_build_object(
          'priority', priority,
          'lead_type', lead_type,
          'should_create_ticket', should_create_ticket
        )
      ELSE original_decision
    END,
    priority = COALESCE(p_new_priority, priority),
    lead_type = COALESCE(p_new_lead_type, lead_type),
    should_create_ticket = COALESCE(p_new_should_create_ticket, should_create_ticket),
    was_overridden = true,
    overridden_at = NOW(),
    overridden_by_user_id = v_user_id,
    override_reason = COALESCE(p_override_reason, override_reason),
    override_reason_category = COALESCE(v_category, override_reason_category)
  WHERE id = v_decision_id;

  SELECT jsonb_build_object(
    'success', true,
    'lead_event_id', p_lead_event_id,
    'changes', jsonb_build_object(
      'priority', COALESCE(p_new_priority, priority),
      'lead_type', COALESCE(p_new_lead_type, lead_type),
      'should_create_ticket', COALESCE(p_new_should_create_ticket, should_create_ticket)
    )
  ) INTO v_result
  FROM ai_decision_logs
  WHERE id = v_decision_id;

  RETURN v_result;
END;
$$;
