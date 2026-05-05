
-- H5: Webhook retry hardening — resurrection + guaranteed notification

-- 1) Resurrect deliveries stuck in 'sending' (e.g. dispatcher crashed between
--    claim and record_delivery_result). Technical retry: do NOT increment attempt_count.
CREATE OR REPLACE FUNCTION public.requeue_stuck_webhook_deliveries(
  p_stuck_minutes integer DEFAULT 5,
  p_limit integer DEFAULT 500
)
RETURNS TABLE(requeued_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH stuck AS (
    SELECT id
    FROM public.outbound_webhook_deliveries
    WHERE status = 'sending'
      AND updated_at < now() - make_interval(mins => p_stuck_minutes)
    ORDER BY updated_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ),
  upd AS (
    UPDATE public.outbound_webhook_deliveries d
       SET status = 'pending',
           next_attempt_at = now(),
           updated_at = now(),
           last_error = COALESCE('resurrected_after_'||p_stuck_minutes||'min: '||COALESCE(d.last_error,''), d.last_error)
      FROM stuck
     WHERE d.id = stuck.id
    RETURNING d.id
  )
  SELECT count(*)::int INTO v_count FROM upd;

  -- Audit (best-effort)
  IF v_count > 0 THEN
    BEGIN
      PERFORM public.log_audit_event(
        p_entity_type := 'webhook_delivery',
        p_action      := 'webhook.delivery.resurrected',
        p_metadata    := jsonb_build_object('count', v_count, 'stuck_minutes', p_stuck_minutes),
        p_source      := 'requeue_stuck_webhook_deliveries'
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  RETURN QUERY SELECT v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.requeue_stuck_webhook_deliveries(integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.requeue_stuck_webhook_deliveries(integer,integer) TO authenticated, service_role;

-- 2) Patch record_delivery_result to fan-out a notification to brand admins on dead-letter.
CREATE OR REPLACE FUNCTION public.record_delivery_result(
  p_delivery_id uuid,
  p_success boolean,
  p_response_status integer DEFAULT NULL,
  p_response_body text DEFAULT NULL,
  p_error text DEFAULT NULL,
  p_duration_ms integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_delivery RECORD;
  v_new_status webhook_delivery_status;
  v_next_attempt TIMESTAMP WITH TIME ZONE;
  v_is_dead BOOLEAN := FALSE;
  v_backoff_minutes INTEGER[] := ARRAY[1, 5, 15, 60, 360, 1440];
  v_backoff_index INTEGER;
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
    IF v_delivery.attempt_count + 1 >= v_delivery.max_attempts THEN
      v_new_status := 'dead';
      v_is_dead := TRUE;
    ELSE
      v_new_status := 'failed';
      v_backoff_index := LEAST(v_delivery.attempt_count + 1, array_length(v_backoff_minutes, 1));
      v_next_attempt := NOW()
        + (v_backoff_minutes[v_backoff_index] * INTERVAL '1 minute')
        + (random() * INTERVAL '30 seconds');
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
    dead_at = CASE WHEN v_is_dead THEN NOW() ELSE dead_at END,
    updated_at = NOW()
  WHERE id = p_delivery_id;

  -- H5: guaranteed notification to brand admins on dead-letter.
  IF v_is_dead THEN
    BEGIN
      SELECT url INTO v_webhook_url FROM public.outbound_webhooks WHERE id = v_delivery.webhook_id;

      INSERT INTO public.notifications(brand_id, user_id, type, title, body, entity_type, entity_id)
      SELECT
        v_delivery.brand_id,
        ur.user_id,
        'system'::notification_type,
        'Webhook in dead-letter',
        format('Consegna webhook fallita dopo %s tentativi (event=%s, url=%s). Aprire la dashboard "Webhook delivery health".',
               v_delivery.max_attempts, v_delivery.event_type, COALESCE(v_webhook_url,'?')),
        'outbound_webhook_delivery',
        v_delivery.id
      FROM public.user_roles ur
      WHERE ur.brand_id = v_delivery.brand_id
        AND ur.role = 'admin'::app_role
        AND ur.is_active = true
      ON CONFLICT DO NOTHING;

      PERFORM public.log_audit_event(
        p_entity_type := 'webhook_delivery',
        p_action      := 'webhook.delivery.dead_letter',
        p_brand_id    := v_delivery.brand_id,
        p_entity_id   := v_delivery.id,
        p_metadata    := jsonb_build_object(
          'webhook_id', v_delivery.webhook_id,
          'event_type', v_delivery.event_type,
          'event_id', v_delivery.event_id,
          'attempts', v_delivery.attempt_count + 1,
          'last_error', p_error
        ),
        p_source      := 'record_delivery_result'
      );
    EXCEPTION WHEN OTHERS THEN
      -- never block the dead-letter transition
      NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'status', v_new_status::text,
    'attempt', v_delivery.attempt_count + 1,
    'max_attempts', v_delivery.max_attempts,
    'is_dead', v_is_dead,
    'next_attempt_at', v_next_attempt
  );
END;
$function$;
