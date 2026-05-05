CREATE OR REPLACE FUNCTION public.calculate_slo_burn_rate(p_slo_id uuid)
RETURNS TABLE(current_sli numeric, error_budget_remaining numeric, burn_rate_1h numeric, burn_rate_6h numeric, burn_rate_24h numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_def RECORD;
  v_total_good BIGINT;
  v_total_all BIGINT;
  v_window_good BIGINT;
  v_window_all BIGINT;
  v_target NUMERIC;
  v_sli NUMERIC;
  v_budget NUMERIC;
  v_burn_1h NUMERIC;
  v_burn_6h NUMERIC;
  v_burn_24h NUMERIC;
BEGIN
  SELECT * INTO v_def FROM public.slo_definitions WHERE id = p_slo_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_target := v_def.target_percentage / 100.0;

  SELECT COALESCE(SUM(good_events), 0), COALESCE(SUM(total_events), 0)
  INTO v_total_good, v_total_all
  FROM public.slo_measurements
  WHERE slo_id = p_slo_id
    AND measured_at >= now() - (v_def.window_days || ' days')::interval;

  v_sli := CASE WHEN v_total_all > 0 THEN v_total_good::numeric / v_total_all ELSE 1 END;
  v_budget := CASE WHEN (1 - v_target) > 0 THEN ((v_sli - v_target) / (1 - v_target)) * 100 ELSE 100 END;

  SELECT COALESCE(SUM(good_events), 0), COALESCE(SUM(total_events), 0)
  INTO v_window_good, v_window_all
  FROM public.slo_measurements
  WHERE slo_id = p_slo_id AND measured_at >= now() - interval '1 hour';
  v_burn_1h := CASE WHEN v_window_all > 0 AND (1 - v_target) > 0
    THEN ((v_window_all - v_window_good)::numeric / v_window_all) / (1 - v_target)
    ELSE 0 END;

  SELECT COALESCE(SUM(good_events), 0), COALESCE(SUM(total_events), 0)
  INTO v_window_good, v_window_all
  FROM public.slo_measurements
  WHERE slo_id = p_slo_id AND measured_at >= now() - interval '6 hours';
  v_burn_6h := CASE WHEN v_window_all > 0 AND (1 - v_target) > 0
    THEN ((v_window_all - v_window_good)::numeric / v_window_all) / (1 - v_target)
    ELSE 0 END;

  SELECT COALESCE(SUM(good_events), 0), COALESCE(SUM(total_events), 0)
  INTO v_window_good, v_window_all
  FROM public.slo_measurements
  WHERE slo_id = p_slo_id AND measured_at >= now() - interval '24 hours';
  v_burn_24h := CASE WHEN v_window_all > 0 AND (1 - v_target) > 0
    THEN ((v_window_all - v_window_good)::numeric / v_window_all) / (1 - v_target)
    ELSE 0 END;

  -- Clamp to numeric(7,4) bounds to avoid overflow on aggressive SLOs
  RETURN QUERY SELECT
    GREATEST(LEAST(v_sli,    999.9999), -999.9999),
    GREATEST(LEAST(v_budget, 999.9999), -999.9999),
    GREATEST(LEAST(v_burn_1h, 999.9999), -999.9999),
    GREATEST(LEAST(v_burn_6h, 999.9999), -999.9999),
    GREATEST(LEAST(v_burn_24h, 999.9999), -999.9999);
END;
$function$;