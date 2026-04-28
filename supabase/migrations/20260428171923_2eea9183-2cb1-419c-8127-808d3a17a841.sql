-- ============================================================
-- RISK SCORE AUTOMATION (PURELY ADDITIVE)
-- - Reuses existing appointments.risk_score column (numeric(5,2))
-- - Trigger BEFORE INSERT/UPDATE computes score deterministically
-- - Backfill ONLY future appointments (storico intatto)
-- ============================================================

-- 1) Compute function (SECURITY DEFINER, deterministic)
CREATE OR REPLACE FUNCTION public.compute_appointment_risk_score(p_appointment_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_score numeric := 0;
  v_appt RECORD;
  v_no_show_count int := 0;
  v_reschedule_count int := 0;
  v_has_phone boolean := false;
  v_hours_until numeric;
BEGIN
  SELECT id, contact_id, scheduled_at, status, address, city,
         assigned_sales_user_id, appointment_type
  INTO v_appt
  FROM public.appointments
  WHERE id = p_appointment_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Skip terminal statuses
  IF v_appt.status IN ('cancelled', 'visited', 'completed', 'no_show') THEN
    RETURN 0;
  END IF;

  v_hours_until := EXTRACT(EPOCH FROM (v_appt.scheduled_at - now())) / 3600;

  -- +25: draft entro 24h
  IF v_appt.status = 'draft' AND v_hours_until BETWEEN 0 AND 24 THEN
    v_score := v_score + 25;
  END IF;

  -- +20: contatto con storico no-show
  SELECT COUNT(*) INTO v_no_show_count
  FROM public.appointment_outcomes ao
  JOIN public.appointments a ON a.id = ao.appointment_id
  WHERE a.contact_id = v_appt.contact_id
    AND ao.outcome_code IN ('no_show_client', 'no_show_operator');
  IF v_no_show_count > 0 THEN
    v_score := v_score + 20;
  END IF;

  -- +15: contatto con >2 riprogrammazioni
  SELECT COUNT(*) INTO v_reschedule_count
  FROM public.appointment_outcomes ao
  JOIN public.appointments a ON a.id = ao.appointment_id
  WHERE a.contact_id = v_appt.contact_id
    AND ao.outcome_code = 'rescheduled';
  IF v_reschedule_count > 2 THEN
    v_score := v_score + 15;
  END IF;

  -- +15: manca telefono primario
  SELECT EXISTS (
    SELECT 1 FROM public.contact_phones
    WHERE contact_id = v_appt.contact_id
      AND is_primary = true
      AND is_active = true
  ) INTO v_has_phone;
  IF NOT v_has_phone THEN
    v_score := v_score + 15;
  END IF;

  -- +10: manca indirizzo o città
  IF v_appt.address IS NULL OR v_appt.city IS NULL THEN
    v_score := v_score + 10;
  END IF;

  -- +10: nessun sales assegnato a <48h
  IF v_appt.assigned_sales_user_id IS NULL AND v_hours_until BETWEEN 0 AND 48 THEN
    v_score := v_score + 10;
  END IF;

  -- +5: follow_up
  IF v_appt.appointment_type = 'follow_up' THEN
    v_score := v_score + 5;
  END IF;

  -- Cap at 100
  IF v_score > 100 THEN
    v_score := 100;
  END IF;

  RETURN v_score;
END;
$$;

-- 2) Trigger function (BEFORE INSERT/UPDATE)
CREATE OR REPLACE FUNCTION public.appointments_set_risk_score()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Compute only when relevant fields changed (or new row)
  IF TG_OP = 'INSERT' OR
     NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at OR
     NEW.status IS DISTINCT FROM OLD.status OR
     NEW.address IS DISTINCT FROM OLD.address OR
     NEW.city IS DISTINCT FROM OLD.city OR
     NEW.assigned_sales_user_id IS DISTINCT FROM OLD.assigned_sales_user_id OR
     NEW.appointment_type IS DISTINCT FROM OLD.appointment_type THEN

    -- Inline compute (avoid double SELECT — use NEW row directly via helper logic)
    -- For simplicity & consistency: call function AFTER row exists (use AFTER trigger pattern)
    NEW.risk_score := NULL; -- will be set by AFTER trigger
  END IF;
  RETURN NEW;
END;
$$;

-- AFTER trigger: now row exists, recompute and update
CREATE OR REPLACE FUNCTION public.appointments_recompute_risk_score()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_score numeric;
BEGIN
  v_new_score := public.compute_appointment_risk_score(NEW.id);
  IF v_new_score IS DISTINCT FROM NEW.risk_score THEN
    UPDATE public.appointments
    SET risk_score = v_new_score
    WHERE id = NEW.id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_appointments_recompute_risk_score ON public.appointments;
CREATE TRIGGER trg_appointments_recompute_risk_score
AFTER INSERT OR UPDATE OF scheduled_at, status, address, city, assigned_sales_user_id, appointment_type
ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.appointments_recompute_risk_score();

-- 3) Backfill ONLY future appointments (storico intatto, max 1000 righe)
DO $$
DECLARE
  r RECORD;
  v_count int := 0;
BEGIN
  FOR r IN
    SELECT id FROM public.appointments
    WHERE scheduled_at >= now()
      AND status NOT IN ('cancelled', 'visited', 'completed', 'no_show')
    ORDER BY scheduled_at ASC
    LIMIT 1000
  LOOP
    UPDATE public.appointments
    SET risk_score = public.compute_appointment_risk_score(r.id)
    WHERE id = r.id;
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE 'Risk score backfilled for % future appointments', v_count;
END $$;

COMMENT ON FUNCTION public.compute_appointment_risk_score(uuid) IS
'Deterministic 0-100 risk score. Signals: draft<24h, no-show history, reschedules, missing phone/address, unassigned <48h, follow_up.';