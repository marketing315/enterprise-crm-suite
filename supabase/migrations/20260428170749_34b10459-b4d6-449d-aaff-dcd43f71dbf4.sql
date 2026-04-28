CREATE OR REPLACE FUNCTION public.get_appointments_ops_kpi(
  p_brand_id uuid,
  p_date_from timestamptz,
  p_date_to timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total int;
  v_status_breakdown jsonb;
  v_outcome_breakdown jsonb;
  v_executed int;
  v_no_show int;
  v_at_risk int;
  v_follow_up int;
  v_avg_risk_score numeric;
BEGIN
  -- Totale appuntamenti nella finestra
  SELECT COUNT(*) INTO v_total
  FROM public.appointments
  WHERE brand_id = p_brand_id
    AND scheduled_at >= p_date_from
    AND scheduled_at < p_date_to;

  -- Distribuzione per status
  SELECT COALESCE(jsonb_object_agg(status, cnt), '{}'::jsonb) INTO v_status_breakdown
  FROM (
    SELECT status::text AS status, COUNT(*)::int AS cnt
    FROM public.appointments
    WHERE brand_id = p_brand_id
      AND scheduled_at >= p_date_from
      AND scheduled_at < p_date_to
    GROUP BY status
    LIMIT 1000
  ) s;

  -- Distribuzione outcomes
  SELECT COALESCE(jsonb_object_agg(outcome_code, cnt), '{}'::jsonb) INTO v_outcome_breakdown
  FROM (
    SELECT outcome_code::text AS outcome_code, COUNT(*)::int AS cnt
    FROM public.appointment_outcomes ao
    JOIN public.appointments a ON a.id = ao.appointment_id
    WHERE ao.brand_id = p_brand_id
      AND a.scheduled_at >= p_date_from
      AND a.scheduled_at < p_date_to
    GROUP BY outcome_code
    LIMIT 1000
  ) o;

  v_executed := COALESCE((v_outcome_breakdown->>'executed')::int, 0);
  v_no_show := COALESCE((v_outcome_breakdown->>'no_show_client')::int, 0)
             + COALESCE((v_outcome_breakdown->>'no_show_operator')::int, 0);

  -- A rischio: appuntamenti nelle prossime 48h ancora non confermati
  SELECT COUNT(*) INTO v_at_risk
  FROM public.appointments
  WHERE brand_id = p_brand_id
    AND scheduled_at >= now()
    AND scheduled_at < now() + interval '48 hours'
    AND status IN ('scheduled', 'draft');

  -- Follow-up: outcomes registrati ultimi 7gg con next_action presente
  SELECT COUNT(*) INTO v_follow_up
  FROM public.appointment_outcomes
  WHERE brand_id = p_brand_id
    AND recorded_at >= now() - interval '7 days'
    AND next_action IS NOT NULL
    AND length(trim(next_action)) > 0;

  -- Risk score medio (se popolato)
  SELECT AVG(risk_score) INTO v_avg_risk_score
  FROM public.appointments
  WHERE brand_id = p_brand_id
    AND scheduled_at >= p_date_from
    AND scheduled_at < p_date_to
    AND risk_score IS NOT NULL;

  RETURN jsonb_build_object(
    'total', v_total,
    'status_breakdown', v_status_breakdown,
    'outcome_breakdown', v_outcome_breakdown,
    'executed_count', v_executed,
    'no_show_count', v_no_show,
    'execution_rate', CASE WHEN v_total > 0 THEN ROUND((v_executed::numeric / v_total) * 100, 1) ELSE 0 END,
    'no_show_rate', CASE WHEN v_total > 0 THEN ROUND((v_no_show::numeric / v_total) * 100, 1) ELSE 0 END,
    'at_risk_next_48h', v_at_risk,
    'pending_follow_up', v_follow_up,
    'avg_risk_score', COALESCE(ROUND(v_avg_risk_score, 2), 0)
  );
END;
$$;

COMMENT ON FUNCTION public.get_appointments_ops_kpi IS
  'Phase 1 Block 4: Read-only KPI aggregator for Ops Board. Returns single JSONB with totals, breakdowns and rates.';