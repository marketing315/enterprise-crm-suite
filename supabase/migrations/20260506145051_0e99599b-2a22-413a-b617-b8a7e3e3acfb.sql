
-- =====================================================================
-- H7 — Retry cap + DLQ + anomaly on dead-letter
-- =====================================================================

-- ---------- 1. outbound_webhook_deliveries: cap retries to 5 ----------
ALTER TABLE public.outbound_webhook_deliveries
  ALTER COLUMN max_attempts SET DEFAULT 5;

-- Normalize existing rows that have a higher cap (no rows are deleted).
UPDATE public.outbound_webhook_deliveries
SET max_attempts = 5
WHERE max_attempts > 5
  AND status IN ('pending', 'failed', 'sending');

-- Re-do record_delivery_result with shared backoff (250ms,1s,5s,30s,5min).
CREATE OR REPLACE FUNCTION public.record_delivery_result(
  p_delivery_id uuid,
  p_success boolean,
  p_response_status integer DEFAULT NULL::integer,
  p_response_body text DEFAULT NULL::text,
  p_error text DEFAULT NULL::text,
  p_duration_ms integer DEFAULT NULL::integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_delivery RECORD;
  v_new_status webhook_delivery_status;
  v_next_attempt timestamptz;
  v_is_dead boolean := false;
  -- ms backoff aligned with _shared/retry-policy.ts (BACKOFF_MS).
  v_backoff_ms integer[] := ARRAY[250, 1000, 5000, 30000, 300000];
  v_backoff_idx integer;
  v_webhook_url text;
BEGIN
  SELECT * INTO v_delivery
  FROM public.outbound_webhook_deliveries
  WHERE id = p_delivery_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'delivery_not_found');
  END IF;

  IF p_success THEN
    v_new_status := 'success';
    v_next_attempt := NULL;
  ELSE
    IF v_delivery.attempt_count + 1 >= LEAST(v_delivery.max_attempts, 5) THEN
      v_new_status := 'dead';
      v_is_dead := true;
    ELSE
      v_new_status := 'failed';
      v_backoff_idx := LEAST(v_delivery.attempt_count + 1, array_length(v_backoff_ms, 1));
      v_next_attempt := now()
        + make_interval(secs => v_backoff_ms[v_backoff_idx]::float / 1000.0)
        + (random() * interval '50 milliseconds');
    END IF;
  END IF;

  UPDATE public.outbound_webhook_deliveries SET
    status = v_new_status,
    attempt_count = attempt_count + 1,
    response_status = p_response_status,
    response_body = p_response_body,
    last_error = p_error,
    duration_ms = p_duration_ms,
    next_attempt_at = COALESCE(v_next_attempt, next_attempt_at),
    dead_at = CASE WHEN v_is_dead THEN now() ELSE dead_at END,
    updated_at = now()
  WHERE id = p_delivery_id;

  IF v_is_dead THEN
    BEGIN
      SELECT url INTO v_webhook_url FROM public.outbound_webhooks WHERE id = v_delivery.webhook_id;

      -- Notify brand admins
      INSERT INTO public.notifications(brand_id, user_id, type, title, body, entity_type, entity_id)
      SELECT
        v_delivery.brand_id, ur.user_id, 'system'::notification_type,
        'Webhook in dead-letter',
        format('Consegna webhook fallita dopo %s tentativi (event=%s, url=%s).',
               LEAST(v_delivery.max_attempts, 5), v_delivery.event_type, COALESCE(v_webhook_url,'?')),
        'outbound_webhook_delivery', v_delivery.id
      FROM public.user_roles ur
      WHERE ur.brand_id = v_delivery.brand_id
        AND ur.role = 'admin'::app_role AND ur.is_active = true
      ON CONFLICT DO NOTHING;

      -- H7: structured anomaly so audit-alert-dispatcher fans it out.
      INSERT INTO public.audit_anomalies(
        brand_id, anomaly_type, severity, title, description, details
      ) VALUES (
        v_delivery.brand_id, 'webhook.dead_letter', 'warning',
        'Outbound webhook in dead-letter',
        format('webhook=%s event=%s attempts=%s', v_delivery.webhook_id, v_delivery.event_type, LEAST(v_delivery.max_attempts,5)),
        jsonb_build_object(
          'webhook_id', v_delivery.webhook_id,
          'delivery_id', v_delivery.id,
          'event_type', v_delivery.event_type,
          'event_id', v_delivery.event_id,
          'url', v_webhook_url,
          'last_error', p_error
        )
      );

      PERFORM public.log_audit_event(
        p_entity_type := 'webhook_delivery',
        p_action      := 'webhook.delivery.dead_letter',
        p_brand_id    := v_delivery.brand_id,
        p_entity_id   := v_delivery.id,
        p_metadata    := jsonb_build_object(
          'webhook_id', v_delivery.webhook_id,
          'event_type', v_delivery.event_type,
          'attempts', v_delivery.attempt_count + 1,
          'last_error', p_error
        ),
        p_source      := 'record_delivery_result'
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'status', v_new_status::text,
    'attempt', v_delivery.attempt_count + 1,
    'max_attempts', LEAST(v_delivery.max_attempts, 5),
    'is_dead', v_is_dead,
    'next_attempt_at', v_next_attempt
  );
END;
$function$;

-- ---------- 2. lead_digest_runs: dead_letter column + cap ----------
ALTER TABLE public.lead_digest_runs
  ADD COLUMN IF NOT EXISTS dead_letter boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dead_at timestamptz;

-- ---------- 3. Helper: is_admin_or_ceo (used by replay RPCs) ----------
CREATE OR REPLACE FUNCTION public.is_admin_or_ceo_user(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p_user_id AND ur.is_active
      AND ur.role IN ('admin'::app_role, 'ceo'::app_role)
  );
$$;

-- ---------- 4. DLQ views ----------
CREATE OR REPLACE VIEW public.outbound_webhook_dlq AS
SELECT id, brand_id, webhook_id, event_type, event_id,
       attempt_count, max_attempts, last_error,
       response_status, dead_at, created_at, updated_at
FROM public.outbound_webhook_deliveries
WHERE status = 'dead';

CREATE OR REPLACE VIEW public.sheets_export_dlq AS
SELECT id, brand_id, lead_event_id, tab_name,
       attempts, max_attempts, last_error, last_attempt_at, created_at
FROM public.sheets_export_logs
WHERE dead_letter = true;

CREATE OR REPLACE VIEW public.lead_digest_dlq AS
SELECT id, trigger_type, status, attempt_no, error_message,
       window_start, window_end, dead_at, created_at
FROM public.lead_digest_runs
WHERE dead_letter = true;

CREATE OR REPLACE VIEW public.notification_webhook_dlq AS
SELECT id, destination_id, brand_id, notification_type,
       attempts, last_error, last_attempt_at, created_at
FROM public.notification_webhook_outbox
WHERE status = 'dead_letter';

-- ---------- 5. Replay RPCs (admin/CEO only) ----------
CREATE OR REPLACE FUNCTION public.replay_outbound_webhook_dlq(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_caller uuid; v_row RECORD;
BEGIN
  SELECT id INTO v_caller FROM public.users WHERE supabase_auth_id = auth.uid();
  IF NOT public.is_admin_or_ceo_user(v_caller) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  UPDATE public.outbound_webhook_deliveries
    SET status='pending', attempt_count=0, next_attempt_at=now(),
        dead_at=NULL, last_error=NULL, response_status=NULL,
        max_attempts=LEAST(max_attempts,5), updated_at=now()
    WHERE id=p_id AND status='dead'
    RETURNING * INTO v_row;

  IF NOT FOUND THEN RETURN jsonb_build_object('replayed', false); END IF;

  PERFORM public.log_audit_event(
    p_entity_type := 'webhook_delivery',
    p_action      := 'webhook.delivery.dlq_replay',
    p_brand_id    := v_row.brand_id,
    p_entity_id   := v_row.id,
    p_metadata    := jsonb_build_object('webhook_id', v_row.webhook_id, 'event_type', v_row.event_type),
    p_source      := 'replay_outbound_webhook_dlq'
  );
  RETURN jsonb_build_object('replayed', true, 'delivery_id', v_row.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.replay_sheets_export_dlq(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_caller uuid; v_row RECORD;
BEGIN
  SELECT id INTO v_caller FROM public.users WHERE supabase_auth_id = auth.uid();
  IF NOT public.is_admin_or_ceo_user(v_caller) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  UPDATE public.sheets_export_logs
    SET status='pending', attempts=0, dead_letter=false,
        next_attempt_at=now(), last_error=NULL,
        max_attempts=LEAST(COALESCE(max_attempts,5),5)
    WHERE id=p_id AND dead_letter=true
    RETURNING * INTO v_row;

  IF NOT FOUND THEN RETURN jsonb_build_object('replayed', false); END IF;

  PERFORM public.log_audit_event(
    p_entity_type := 'sheets_export',
    p_action      := 'sheets.export.dlq_replay',
    p_brand_id    := v_row.brand_id,
    p_entity_id   := v_row.id,
    p_metadata    := jsonb_build_object('lead_event_id', v_row.lead_event_id, 'tab', v_row.tab_name),
    p_source      := 'replay_sheets_export_dlq'
  );
  RETURN jsonb_build_object('replayed', true, 'log_id', v_row.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.replay_lead_digest_dlq(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_caller uuid; v_row RECORD;
BEGIN
  SELECT id INTO v_caller FROM public.users WHERE supabase_auth_id = auth.uid();
  IF NOT public.is_admin_or_ceo_user(v_caller) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  UPDATE public.lead_digest_runs
    SET status='failed', dead_letter=false, dead_at=NULL,
        attempt_no=0, scheduled_for_retry_at=now(), error_message=NULL
    WHERE id=p_id AND dead_letter=true
    RETURNING * INTO v_row;

  IF NOT FOUND THEN RETURN jsonb_build_object('replayed', false); END IF;

  PERFORM public.log_audit_event(
    p_entity_type := 'lead_digest_run',
    p_action      := 'lead_digest.dlq_replay',
    p_entity_id   := v_row.id,
    p_metadata    := jsonb_build_object('window_start', v_row.window_start),
    p_source      := 'replay_lead_digest_dlq'
  );
  RETURN jsonb_build_object('replayed', true, 'run_id', v_row.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.replay_notification_webhook_dlq(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_caller uuid; v_row RECORD;
BEGIN
  SELECT id INTO v_caller FROM public.users WHERE supabase_auth_id = auth.uid();
  IF NOT public.is_admin_or_ceo_user(v_caller) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  UPDATE public.notification_webhook_outbox
    SET status='pending', attempts=0, next_retry_at=now(), last_error=NULL
    WHERE id=p_id AND status='dead_letter'
    RETURNING * INTO v_row;

  IF NOT FOUND THEN RETURN jsonb_build_object('replayed', false); END IF;

  PERFORM public.log_audit_event(
    p_entity_type := 'notification_webhook_outbox',
    p_action      := 'notification_webhook.dlq_replay',
    p_brand_id    := v_row.brand_id,
    p_entity_id   := v_row.id,
    p_metadata    := jsonb_build_object('destination_id', v_row.destination_id, 'type', v_row.notification_type),
    p_source      := 'replay_notification_webhook_dlq'
  );
  RETURN jsonb_build_object('replayed', true, 'outbox_id', v_row.id);
END;
$$;

-- Grant execute only to authenticated; the functions themselves enforce admin/CEO.
REVOKE ALL ON FUNCTION public.replay_outbound_webhook_dlq(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.replay_sheets_export_dlq(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.replay_lead_digest_dlq(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.replay_notification_webhook_dlq(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replay_outbound_webhook_dlq(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.replay_sheets_export_dlq(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.replay_lead_digest_dlq(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.replay_notification_webhook_dlq(uuid) TO authenticated;

-- ---------- 6. Anomaly trigger on lead_digest_runs / sheets_export_logs / notification_webhook_outbox ----------
CREATE OR REPLACE FUNCTION public._h7_anomaly_on_dead_letter()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only fire when transitioning INTO dead state.
  IF TG_TABLE_NAME = 'lead_digest_runs' THEN
    IF NEW.dead_letter = true AND COALESCE(OLD.dead_letter, false) = false THEN
      INSERT INTO public.audit_anomalies(brand_id, anomaly_type, severity, title, description, details)
      VALUES (
        NULL, 'lead_digest.dead_letter', 'warning',
        'Lead digest in dead-letter',
        format('run=%s attempts=%s', NEW.id, NEW.attempt_no),
        jsonb_build_object('run_id', NEW.id, 'window_start', NEW.window_start, 'last_error', NEW.error_message)
      );
    END IF;
  ELSIF TG_TABLE_NAME = 'sheets_export_logs' THEN
    IF NEW.dead_letter = true AND COALESCE(OLD.dead_letter, false) = false THEN
      INSERT INTO public.audit_anomalies(brand_id, anomaly_type, severity, title, description, details)
      VALUES (
        NEW.brand_id, 'sheets_export.dead_letter', 'warning',
        'Sheets export in dead-letter',
        format('lead_event=%s tab=%s attempts=%s', NEW.lead_event_id, NEW.tab_name, NEW.attempts),
        jsonb_build_object('log_id', NEW.id, 'last_error', NEW.last_error)
      );
    END IF;
  ELSIF TG_TABLE_NAME = 'notification_webhook_outbox' THEN
    IF NEW.status = 'dead_letter' AND COALESCE(OLD.status,'') <> 'dead_letter' THEN
      INSERT INTO public.audit_anomalies(brand_id, anomaly_type, severity, title, description, details)
      VALUES (
        NEW.brand_id, 'notification_webhook.dead_letter', 'warning',
        'Notification webhook in dead-letter',
        format('outbox=%s type=%s attempts=%s', NEW.id, NEW.notification_type, NEW.attempts),
        jsonb_build_object('outbox_id', NEW.id, 'destination_id', NEW.destination_id, 'last_error', NEW.last_error)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_h7_dead_letter_lead_digest ON public.lead_digest_runs;
CREATE TRIGGER trg_h7_dead_letter_lead_digest
  AFTER UPDATE ON public.lead_digest_runs
  FOR EACH ROW EXECUTE FUNCTION public._h7_anomaly_on_dead_letter();

DROP TRIGGER IF EXISTS trg_h7_dead_letter_sheets ON public.sheets_export_logs;
CREATE TRIGGER trg_h7_dead_letter_sheets
  AFTER UPDATE ON public.sheets_export_logs
  FOR EACH ROW EXECUTE FUNCTION public._h7_anomaly_on_dead_letter();

DROP TRIGGER IF EXISTS trg_h7_dead_letter_notification ON public.notification_webhook_outbox;
CREATE TRIGGER trg_h7_dead_letter_notification
  AFTER UPDATE ON public.notification_webhook_outbox
  FOR EACH ROW EXECUTE FUNCTION public._h7_anomaly_on_dead_letter();
