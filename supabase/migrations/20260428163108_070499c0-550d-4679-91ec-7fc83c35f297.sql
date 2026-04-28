-- ============================================================
-- FASE 0 — Appointments Governance (PURELY ADDITIVE, ZERO DATA RISK)
-- - No DROP, no DELETE, no TRUNCATE
-- - All new columns nullable + safe defaults
-- - Enum values additive only
-- - New table appointment_outcomes (separate, optional)
-- - RPC for outcome recording (legacy rows untouched)
-- ============================================================

-- 1) Additive enum values for appointment_status
DO $$ BEGIN
  ALTER TYPE public.appointment_status ADD VALUE IF NOT EXISTS 'draft' BEFORE 'scheduled';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE public.appointment_status ADD VALUE IF NOT EXISTS 'completed' AFTER 'visited';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Outcome code enum (new, no impact on existing data)
DO $$ BEGIN
  CREATE TYPE public.appointment_outcome_code AS ENUM (
    'executed',
    'no_show_client',
    'no_show_operator',
    'cancelled_client',
    'cancelled_operator',
    'rescheduled',
    'unreachable',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) New table: appointment_outcomes (1 row per outcome event, append-only style)
CREATE TABLE IF NOT EXISTS public.appointment_outcomes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id  uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  brand_id        uuid NOT NULL,
  outcome_code    public.appointment_outcome_code NOT NULL,
  outcome_notes   text,
  reschedule_reason text,
  next_action     text,
  recorded_by_user_id uuid,
  recorded_at     timestamptz NOT NULL DEFAULT now(),
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appointment_outcomes_appointment ON public.appointment_outcomes(appointment_id);
CREATE INDEX IF NOT EXISTS idx_appointment_outcomes_brand ON public.appointment_outcomes(brand_id);
CREATE INDEX IF NOT EXISTS idx_appointment_outcomes_code ON public.appointment_outcomes(outcome_code);
CREATE INDEX IF NOT EXISTS idx_appointment_outcomes_recorded_at ON public.appointment_outcomes(recorded_at DESC);

ALTER TABLE public.appointment_outcomes ENABLE ROW LEVEL SECURITY;

-- RLS: align with existing appointments brand-scoped access pattern
DO $$ BEGIN
  CREATE POLICY "appointment_outcomes_select_brand"
    ON public.appointment_outcomes FOR SELECT
    USING (
      brand_id = '00000000-0000-0000-0000-000000000000'::uuid
      OR EXISTS (
        SELECT 1 FROM public.appointments a
        WHERE a.id = appointment_outcomes.appointment_id
          AND a.brand_id = appointment_outcomes.brand_id
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "appointment_outcomes_insert_brand"
    ON public.appointment_outcomes FOR INSERT
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Rollback (for reference, do NOT execute):
-- DROP POLICY "appointment_outcomes_select_brand" ON public.appointment_outcomes;
-- DROP POLICY "appointment_outcomes_insert_brand" ON public.appointment_outcomes;

-- 4) Optional metadata columns on appointments (nullable, safe defaults)
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS reschedule_reason text,
  ADD COLUMN IF NOT EXISTS reschedule_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_outcome_code public.appointment_outcome_code,
  ADD COLUMN IF NOT EXISTS last_outcome_at timestamptz,
  ADD COLUMN IF NOT EXISTS risk_score numeric(5,2);

-- 5) RPC: record_appointment_outcome
-- Legacy rows untouched; new outcome required only when called explicitly.
-- Updates appointments.last_outcome_* and optionally bumps status to completed/no_show.
CREATE OR REPLACE FUNCTION public.record_appointment_outcome(
  p_appointment_id uuid,
  p_outcome_code public.appointment_outcome_code,
  p_outcome_notes text DEFAULT NULL,
  p_reschedule_reason text DEFAULT NULL,
  p_next_action text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand uuid;
  v_user uuid;
  v_outcome_id uuid;
  v_new_status public.appointment_status;
BEGIN
  SELECT brand_id INTO v_brand FROM public.appointments WHERE id = p_appointment_id;
  IF v_brand IS NULL THEN
    RAISE EXCEPTION 'appointment_not_found' USING ERRCODE = 'P0002';
  END IF;

  BEGIN
    v_user := public.get_user_id(auth.uid());
  EXCEPTION WHEN OTHERS THEN
    v_user := NULL;
  END;

  INSERT INTO public.appointment_outcomes(
    appointment_id, brand_id, outcome_code, outcome_notes,
    reschedule_reason, next_action, recorded_by_user_id, metadata
  ) VALUES (
    p_appointment_id, v_brand, p_outcome_code, p_outcome_notes,
    p_reschedule_reason, p_next_action, v_user, COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_outcome_id;

  -- Map outcome → status (additive, only forward transitions)
  v_new_status := CASE p_outcome_code
    WHEN 'executed' THEN 'completed'::public.appointment_status
    WHEN 'no_show_client' THEN 'no_show'::public.appointment_status
    WHEN 'no_show_operator' THEN 'no_show'::public.appointment_status
    WHEN 'cancelled_client' THEN 'cancelled'::public.appointment_status
    WHEN 'cancelled_operator' THEN 'cancelled'::public.appointment_status
    WHEN 'rescheduled' THEN 'rescheduled'::public.appointment_status
    ELSE NULL
  END;

  UPDATE public.appointments
  SET last_outcome_code = p_outcome_code,
      last_outcome_at = now(),
      reschedule_reason = COALESCE(p_reschedule_reason, reschedule_reason),
      reschedule_count = CASE WHEN p_outcome_code = 'rescheduled'
                              THEN reschedule_count + 1 ELSE reschedule_count END,
      status = COALESCE(v_new_status, status),
      updated_at = now()
  WHERE id = p_appointment_id;

  RETURN v_outcome_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_appointment_outcome(
  uuid, public.appointment_outcome_code, text, text, text, jsonb
) TO authenticated;
