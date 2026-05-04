CREATE OR REPLACE FUNCTION public.replay_outbound_webhook_delivery(
  p_delivery_id uuid,
  p_force_new_event_id boolean DEFAULT false
)
RETURNS TABLE(delivery_id uuid, event_id uuid, reused boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_internal_user_id uuid;
  v_brand_id uuid;
  v_webhook_id uuid;
  v_event_type webhook_event_type;
  v_event_id uuid;
  v_payload jsonb;
  v_new_event_id uuid;
  v_new_delivery_id uuid;
BEGIN
  v_internal_user_id := public.get_user_id(auth.uid());
  IF v_internal_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT d.brand_id, d.webhook_id, d.event_type, d.event_id, d.payload
    INTO v_brand_id, v_webhook_id, v_event_type, v_event_id, v_payload
  FROM public.outbound_webhook_deliveries d
  WHERE d.id = p_delivery_id;

  IF v_brand_id IS NULL THEN
    RAISE EXCEPTION 'Delivery not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_role_for_brand(v_internal_user_id, v_brand_id, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  IF p_force_new_event_id THEN
    -- Rare case: admin wants the receiver to treat this as a brand-new event.
    v_new_event_id := gen_random_uuid();
    INSERT INTO public.outbound_webhook_deliveries (
      webhook_id, brand_id, event_type, event_id, payload, status, next_attempt_at, attempt_count
    ) VALUES (
      v_webhook_id, v_brand_id, v_event_type, v_new_event_id, v_payload, 'pending', now(), 0
    )
    RETURNING id INTO v_new_delivery_id;

    RETURN QUERY SELECT v_new_delivery_id, v_new_event_id, false;
  ELSE
    -- Default: idempotent replay — keep event_id stable so the receiver
    -- recognizes the retry via Idempotency-Key.
    UPDATE public.outbound_webhook_deliveries
    SET status = 'pending',
        attempt_count = 0,
        next_attempt_at = now(),
        last_error = NULL,
        response_status = NULL,
        response_body = NULL,
        dead_at = NULL
    WHERE id = p_delivery_id;

    RETURN QUERY SELECT p_delivery_id, v_event_id, true;
  END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.replay_outbound_webhook_delivery(uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.replay_outbound_webhook_delivery(uuid, boolean) TO authenticated, service_role;