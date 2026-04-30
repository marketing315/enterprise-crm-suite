CREATE OR REPLACE FUNCTION public.get_webhook_delivery_health(
  p_brand_id uuid,
  p_from_hours integer DEFAULT 24
)
RETURNS TABLE (
  destination_id uuid,
  destination_name text,
  preset text,
  is_active boolean,
  total_attempts bigint,
  sent_count bigint,
  failed_count bigint,
  dead_letter_count bigint,
  pending_count bigint,
  success_rate numeric,
  avg_latency_seconds numeric,
  p95_latency_seconds numeric,
  last_success_at timestamptz,
  last_error text,
  consecutive_failures integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_internal_user_id uuid;
  v_authorized boolean := false;
  v_from_ts timestamptz;
BEGIN
  IF p_from_hours < 1 OR p_from_hours > 168 THEN
    RAISE EXCEPTION 'from_hours must be between 1 and 168' USING ERRCODE = '22023';
  END IF;

  v_internal_user_id := public.get_user_id(auth.uid());
  IF v_internal_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = v_internal_user_id
      AND ur.is_active = true
      AND ur.role IN ('admin', 'ceo')
      AND (
        ur.brand_id = p_brand_id
        OR ur.brand_id = '00000000-0000-0000-0000-000000000000'::uuid
      )
  ) INTO v_authorized;

  IF NOT v_authorized THEN
    RAISE EXCEPTION 'Insufficient privileges' USING ERRCODE = '42501';
  END IF;

  v_from_ts := now() - (p_from_hours || ' hours')::interval;

  RETURN QUERY
  WITH outbox_window AS (
    SELECT
      o.destination_id,
      o.status,
      o.attempts,
      o.created_at,
      o.delivered_at,
      o.last_error,
      EXTRACT(EPOCH FROM (o.delivered_at - o.created_at)) AS latency_s
    FROM public.notification_webhook_outbox o
    WHERE o.brand_id = p_brand_id
      AND o.created_at >= v_from_ts
  ),
  agg AS (
    SELECT
      destination_id,
      COUNT(*) AS total_attempts,
      COUNT(*) FILTER (WHERE status = 'sent') AS sent_count,
      COUNT(*) FILTER (WHERE status = 'failed') AS failed_count,
      COUNT(*) FILTER (WHERE status = 'dead_letter') AS dead_letter_count,
      COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
      ROUND(
        100.0 * COUNT(*) FILTER (WHERE status = 'sent')::numeric
        / NULLIF(COUNT(*), 0),
        1
      ) AS success_rate,
      ROUND(AVG(latency_s) FILTER (WHERE status = 'sent')::numeric, 2) AS avg_latency_seconds,
      ROUND(
        (PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_s)
         FILTER (WHERE status = 'sent'))::numeric,
        2
      ) AS p95_latency_seconds
    FROM outbox_window
    GROUP BY destination_id
  )
  SELECT
    d.id,
    d.name,
    d.preset,
    d.is_active,
    COALESCE(a.total_attempts, 0),
    COALESCE(a.sent_count, 0),
    COALESCE(a.failed_count, 0),
    COALESCE(a.dead_letter_count, 0),
    COALESCE(a.pending_count, 0),
    COALESCE(a.success_rate, 0),
    COALESCE(a.avg_latency_seconds, 0),
    COALESCE(a.p95_latency_seconds, 0),
    d.last_success_at,
    d.last_error,
    d.consecutive_failures
  FROM public.notification_webhook_destinations d
  LEFT JOIN agg a ON a.destination_id = d.id
  WHERE d.brand_id = p_brand_id
  ORDER BY COALESCE(a.dead_letter_count, 0) DESC, COALESCE(a.failed_count, 0) DESC, d.created_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_webhook_delivery_health(uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_webhook_delivery_health(uuid, integer) TO authenticated;


CREATE OR REPLACE FUNCTION public.replay_webhook_dead_letter(
  p_outbox_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_internal_user_id uuid;
  v_authorized boolean := false;
  v_brand_id uuid;
  v_status text;
BEGIN
  v_internal_user_id := public.get_user_id(auth.uid());
  IF v_internal_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT brand_id, status INTO v_brand_id, v_status
  FROM public.notification_webhook_outbox
  WHERE id = p_outbox_id;

  IF v_brand_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = v_internal_user_id
      AND ur.is_active = true
      AND ur.role IN ('admin', 'ceo')
      AND (
        ur.brand_id = v_brand_id
        OR ur.brand_id = '00000000-0000-0000-0000-000000000000'::uuid
      )
  ) INTO v_authorized;

  IF NOT v_authorized THEN
    RAISE EXCEPTION 'Insufficient privileges' USING ERRCODE = '42501';
  END IF;

  IF v_status NOT IN ('dead_letter', 'failed') THEN
    RETURN false;
  END IF;

  UPDATE public.notification_webhook_outbox
  SET status = 'pending',
      attempts = 0,
      next_retry_at = now(),
      last_error = NULL
  WHERE id = p_outbox_id;

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.replay_webhook_dead_letter(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.replay_webhook_dead_letter(uuid) TO authenticated;