-- Patch record_slo_snapshot to special-case 'backup-freshness' service:
-- good=1 if max(completed_at) within threshold_value hours (default 36), else 0.
CREATE OR REPLACE FUNCTION public.record_slo_snapshot()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_slo RECORD;
  v_good BIGINT;
  v_total BIGINT;
  v_count INTEGER := 0;
  v_calc RECORD;
  v_last_backup timestamptz;
  v_age_hours numeric;
  v_threshold_hours numeric;
BEGIN
  FOR v_slo IN SELECT * FROM public.slo_definitions WHERE is_active = true LOOP
    IF v_slo.service_name = 'backup-freshness' THEN
      -- Special-case: SLI based on backup_runs freshness vs threshold (hours).
      v_threshold_hours := COALESCE(v_slo.threshold_value, 36);
      SELECT max(completed_at) INTO v_last_backup
      FROM public.backup_runs
      WHERE status = 'completed';
      IF v_last_backup IS NULL THEN
        v_good := 0;
      ELSE
        v_age_hours := EXTRACT(EPOCH FROM (now() - v_last_backup)) / 3600.0;
        v_good := CASE WHEN v_age_hours <= v_threshold_hours THEN 1 ELSE 0 END;
      END IF;
      v_total := 1;
    ELSE
      -- Default: derive from trace_events for last 5 minutes.
      SELECT
        COUNT(*) FILTER (WHERE status_code = 'ok'),
        COUNT(*)
      INTO v_good, v_total
      FROM public.trace_events
      WHERE service_name = v_slo.service_name
        AND started_at >= now() - interval '5 minutes';
    END IF;

    INSERT INTO public.slo_measurements(slo_id, good_events, total_events)
    VALUES (v_slo.id, COALESCE(v_good, 0), COALESCE(v_total, 0));

    SELECT * INTO v_calc FROM public.calculate_slo_burn_rate(v_slo.id);
    UPDATE public.slo_measurements
    SET current_sli = v_calc.current_sli,
        error_budget_remaining = v_calc.error_budget_remaining,
        burn_rate_1h = v_calc.burn_rate_1h,
        burn_rate_6h = v_calc.burn_rate_6h,
        burn_rate_24h = v_calc.burn_rate_24h
    WHERE slo_id = v_slo.id
      AND id = (SELECT id FROM public.slo_measurements WHERE slo_id = v_slo.id ORDER BY measured_at DESC LIMIT 1);

    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$function$;