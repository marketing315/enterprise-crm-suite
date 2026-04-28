-- ============================================================
-- HIGH RISK APPOINTMENT NOTIFICATIONS (PURELY ADDITIVE)
-- ============================================================

-- 1) Additive enum value
DO $$ BEGIN
  ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'appointment_risk_alert';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Helpful partial index for dedup lookups (entity_id + type + recent)
CREATE INDEX IF NOT EXISTS idx_notifications_entity_type_recent
  ON public.notifications (entity_type, entity_id, type, created_at DESC);

-- 3) Notifier function — invoked by pg_cron
CREATE OR REPLACE FUNCTION public.notify_high_risk_appointments()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted int := 0;
  v_skipped int := 0;
  r RECORD;
  v_recipient_ids uuid[];
  v_recipient uuid;
BEGIN
  FOR r IN
    SELECT a.id, a.brand_id, a.contact_id, a.scheduled_at, a.assigned_sales_user_id,
           a.risk_score,
           c.first_name, c.last_name
    FROM public.appointments a
    LEFT JOIN public.contacts c ON c.id = a.contact_id
    WHERE a.risk_score >= 60
      AND a.scheduled_at >= now()
      AND a.scheduled_at < now() + interval '24 hours'
      AND a.status NOT IN ('cancelled', 'visited', 'completed', 'no_show')
    ORDER BY a.scheduled_at ASC
    LIMIT 200
  LOOP
    -- Dedup: skip if a risk alert for this appointment was issued in the last 12h
    IF EXISTS (
      SELECT 1 FROM public.notifications
      WHERE entity_type = 'appointment'
        AND entity_id = r.id
        AND type = 'appointment_risk_alert'
        AND created_at > now() - interval '12 hours'
      LIMIT 1
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- Determine recipients
    IF r.assigned_sales_user_id IS NOT NULL THEN
      v_recipient_ids := ARRAY[r.assigned_sales_user_id];
    ELSE
      -- Fallback: brand admins/managers
      SELECT COALESCE(array_agg(DISTINCT ur.user_id), ARRAY[]::uuid[])
      INTO v_recipient_ids
      FROM public.user_roles ur
      WHERE ur.brand_id = r.brand_id
        AND ur.is_active = true
        AND ur.role IN ('admin', 'responsabile_venditori', 'responsabile_callcenter');
    END IF;

    -- Insert one notification per recipient
    FOREACH v_recipient IN ARRAY v_recipient_ids LOOP
      INSERT INTO public.notifications (
        brand_id, user_id, type, title, body, entity_type, entity_id
      )
      VALUES (
        r.brand_id,
        v_recipient,
        'appointment_risk_alert',
        format(
          'Appuntamento a rischio: %s',
          COALESCE(NULLIF(trim(concat_ws(' ', r.first_name, r.last_name)), ''), 'Contatto')
        ),
        format(
          'Risk score %s/100 · previsto %s',
          ROUND(r.risk_score)::text,
          to_char(r.scheduled_at AT TIME ZONE 'Europe/Rome', 'DD/MM HH24:MI')
        ),
        'appointment',
        r.id
      );
      v_inserted := v_inserted + 1;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'inserted', v_inserted,
    'skipped_duplicates', v_skipped,
    'executed_at', now()
  );
END;
$$;

COMMENT ON FUNCTION public.notify_high_risk_appointments() IS
'Generates in-app notifications for appointments with risk_score>=60 in next 24h. Idempotent (12h dedup window). Targets assigned sales or brand admins as fallback.';