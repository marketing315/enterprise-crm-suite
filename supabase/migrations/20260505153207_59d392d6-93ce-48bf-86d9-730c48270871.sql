-- G3: Backup freshness monitor + admin notification
-- Crea RPC che verifica se esistono schedule attivi e se l'ultimo backup completato
-- e' piu' vecchio di una soglia. In caso di anomalia notifica admin/ceo (dedupe 24h).

CREATE OR REPLACE FUNCTION public.check_backup_freshness(p_threshold_hours integer DEFAULT 36)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last_completed_at timestamptz;
  v_age_hours numeric;
  v_enabled_schedules integer;
  v_alert_reason text := NULL;
  v_alert_title text;
  v_alert_body text;
  v_admin record;
  v_inserted integer := 0;
  v_dedupe_window interval := interval '24 hours';
  v_system_brand uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
  SELECT max(completed_at) INTO v_last_completed_at
  FROM public.backup_runs
  WHERE status = 'completed';

  SELECT count(*) INTO v_enabled_schedules
  FROM public.backup_schedules
  WHERE enabled = true;

  IF v_last_completed_at IS NULL THEN
    v_age_hours := NULL;
    v_alert_reason := 'no_completed_backup';
  ELSE
    v_age_hours := EXTRACT(EPOCH FROM (now() - v_last_completed_at)) / 3600.0;
    IF v_age_hours > p_threshold_hours THEN
      v_alert_reason := 'stale_backup';
    END IF;
  END IF;

  IF v_alert_reason IS NULL AND v_enabled_schedules = 0 THEN
    v_alert_reason := 'no_enabled_schedule';
  END IF;

  IF v_alert_reason IS NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'last_completed_at', v_last_completed_at,
      'age_hours', v_age_hours,
      'enabled_schedules', v_enabled_schedules,
      'threshold_hours', p_threshold_hours
    );
  END IF;

  -- Build alert text
  v_alert_title := CASE v_alert_reason
    WHEN 'no_completed_backup'   THEN 'Backup mai completato'
    WHEN 'no_enabled_schedule'   THEN 'Nessun backup pianificato attivo'
    WHEN 'stale_backup'          THEN format('Backup obsoleto: ultimo %s ore fa', round(v_age_hours, 1))
  END;
  v_alert_body := CASE v_alert_reason
    WHEN 'no_completed_backup'
      THEN 'Non risulta alcun backup completato. Verificare scheduled-backup-runner e backup_schedules.'
    WHEN 'no_enabled_schedule'
      THEN 'Il cron scheduled-backup-runner-hourly e'' attivo ma nessuna pianificazione e'' enabled=true: nessun backup automatico verra'' eseguito.'
    WHEN 'stale_backup'
      THEN format('Ultimo backup completato il %s (%s ore fa, soglia %s h). Schedule attivi: %s.',
                  to_char(v_last_completed_at, 'YYYY-MM-DD HH24:MI UTC'),
                  round(v_age_hours, 1),
                  p_threshold_hours,
                  v_enabled_schedules)
  END;

  -- Notify each active admin/ceo, dedupe entro 24h sull'entity_id 'backup-freshness'
  FOR v_admin IN
    SELECT DISTINCT ur.user_id
    FROM public.user_roles ur
    WHERE ur.role IN ('admin','ceo')
      AND COALESCE(ur.is_active, true) = true
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.user_id = v_admin.user_id
        AND n.type = 'slo_alert'
        AND n.entity_type = 'backup_freshness'
        AND n.created_at > now() - v_dedupe_window
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.notifications (brand_id, user_id, type, title, body, entity_type, entity_id)
    VALUES (
      v_system_brand,
      v_admin.user_id,
      'slo_alert'::notification_type,
      v_alert_title,
      v_alert_body,
      'backup_freshness',
      NULL
    );
    v_inserted := v_inserted + 1;
  END LOOP;

  -- Audit centralizzato (best-effort)
  BEGIN
    PERFORM public.log_audit_event(
      'slo.backup_freshness_alert',
      'backup_runs',
      NULL::uuid,
      jsonb_build_object(
        'reason', v_alert_reason,
        'last_completed_at', v_last_completed_at,
        'age_hours', v_age_hours,
        'enabled_schedules', v_enabled_schedules,
        'threshold_hours', p_threshold_hours,
        'notified', v_inserted
      )
    );
  EXCEPTION WHEN undefined_function THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'ok', false,
    'reason', v_alert_reason,
    'last_completed_at', v_last_completed_at,
    'age_hours', v_age_hours,
    'enabled_schedules', v_enabled_schedules,
    'threshold_hours', p_threshold_hours,
    'admins_notified', v_inserted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_backup_freshness(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_backup_freshness(integer) TO service_role;