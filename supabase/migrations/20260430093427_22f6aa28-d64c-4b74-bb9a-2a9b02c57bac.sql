-- 1. Destinations table
CREATE TABLE public.notification_webhook_destinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  name text NOT NULL,
  endpoint_url text NOT NULL,
  hmac_secret text NOT NULL,
  preset text NOT NULL DEFAULT 'generic',
  notification_types public.notification_type[] NOT NULL DEFAULT ARRAY[]::public.notification_type[],
  include_payload boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  retry_max integer NOT NULL DEFAULT 5,
  consecutive_failures integer NOT NULL DEFAULT 0,
  last_success_at timestamptz,
  last_error text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_nwd_preset CHECK (preset IN ('generic','google_sheets','n8n','slack_compatible')),
  CONSTRAINT chk_nwd_retry CHECK (retry_max BETWEEN 1 AND 20)
);

CREATE INDEX idx_nwd_brand_active ON public.notification_webhook_destinations(brand_id) WHERE is_active = true;

ALTER TABLE public.notification_webhook_destinations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage notification webhook destinations"
  ON public.notification_webhook_destinations
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'ceo'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'ceo'::app_role)
  );

-- 2. Outbox
CREATE TABLE public.notification_webhook_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  destination_id uuid NOT NULL REFERENCES public.notification_webhook_destinations(id) ON DELETE CASCADE,
  notification_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  notification_type public.notification_type NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  last_error text,
  next_retry_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_nwo_status CHECK (status IN ('pending','sent','failed','dead_letter'))
);

CREATE INDEX idx_nwo_pending ON public.notification_webhook_outbox(next_retry_at)
  WHERE status = 'pending';
CREATE INDEX idx_nwo_destination ON public.notification_webhook_outbox(destination_id, created_at DESC);

ALTER TABLE public.notification_webhook_outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read notification webhook outbox"
  ON public.notification_webhook_outbox
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'ceo'::app_role)
  );

-- 3. Enqueue trigger
CREATE OR REPLACE FUNCTION public.trg_enqueue_notification_webhook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dest RECORD;
  v_payload jsonb;
BEGIN
  FOR v_dest IN
    SELECT id, include_payload, notification_types
    FROM public.notification_webhook_destinations
    WHERE is_active = true
      AND brand_id = NEW.brand_id
      AND consecutive_failures < retry_max * 3
      AND (
        cardinality(notification_types) = 0
        OR NEW.type = ANY(notification_types)
      )
    LIMIT 50
  LOOP
    v_payload := jsonb_build_object(
      'notification_id', NEW.id,
      'brand_id', NEW.brand_id,
      'user_id', NEW.user_id,
      'type', NEW.type::text,
      'title', NEW.title,
      'body', NEW.body,
      'entity_type', NEW.entity_type,
      'entity_id', NEW.entity_id,
      'created_at', NEW.created_at
    );

    INSERT INTO public.notification_webhook_outbox(
      destination_id, notification_id, brand_id, notification_type, payload
    ) VALUES (
      v_dest.id, NEW.id, NEW.brand_id, NEW.type, v_payload
    );
  END LOOP;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block notification insert on outbox issues
  RAISE WARNING 'enqueue_notification_webhook failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

CREATE TRIGGER notifications_enqueue_webhook
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_enqueue_notification_webhook();

-- 4. Claim RPC for dispatcher
CREATE OR REPLACE FUNCTION public.claim_pending_notification_webhooks(p_limit integer DEFAULT 50)
RETURNS TABLE(
  outbox_id uuid,
  destination_id uuid,
  endpoint_url text,
  hmac_secret text,
  preset text,
  payload jsonb,
  attempts integer,
  retry_max integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT o.id
    FROM public.notification_webhook_outbox o
    JOIN public.notification_webhook_destinations d ON d.id = o.destination_id
    WHERE o.status = 'pending'
      AND o.next_retry_at <= now()
      AND d.is_active = true
    ORDER BY o.next_retry_at ASC
    LIMIT LEAST(GREATEST(p_limit, 1), 200)
    FOR UPDATE OF o SKIP LOCKED
  )
  UPDATE public.notification_webhook_outbox o
  SET attempts = o.attempts + 1,
      last_attempt_at = now()
  FROM claimed c, public.notification_webhook_destinations d
  WHERE o.id = c.id AND d.id = o.destination_id
  RETURNING
    o.id,
    o.destination_id,
    d.endpoint_url,
    d.hmac_secret,
    d.preset,
    o.payload,
    o.attempts,
    d.retry_max;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_pending_notification_webhooks(integer) FROM anon, authenticated;

-- 5. Result RPC
CREATE OR REPLACE FUNCTION public.mark_notification_webhook_result(
  p_outbox_id uuid,
  p_success boolean,
  p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
  v_retry_max integer;
  v_backoff_seconds integer;
BEGIN
  SELECT o.*, d.retry_max
    INTO v_row
  FROM public.notification_webhook_outbox o
  JOIN public.notification_webhook_destinations d ON d.id = o.destination_id
  WHERE o.id = p_outbox_id;

  IF NOT FOUND THEN RETURN; END IF;
  v_retry_max := v_row.retry_max;

  IF p_success THEN
    UPDATE public.notification_webhook_outbox
    SET status = 'sent', delivered_at = now(), last_error = NULL
    WHERE id = p_outbox_id;

    UPDATE public.notification_webhook_destinations
    SET consecutive_failures = 0,
        last_success_at = now(),
        last_error = NULL,
        updated_at = now()
    WHERE id = v_row.destination_id;
  ELSE
    v_backoff_seconds := LEAST(3600, 30 * (2 ^ v_row.attempts)::integer);

    IF v_row.attempts >= v_retry_max THEN
      UPDATE public.notification_webhook_outbox
      SET status = 'dead_letter', last_error = p_error
      WHERE id = p_outbox_id;
    ELSE
      UPDATE public.notification_webhook_outbox
      SET status = 'pending',
          next_retry_at = now() + (v_backoff_seconds || ' seconds')::interval,
          last_error = p_error
      WHERE id = p_outbox_id;
    END IF;

    UPDATE public.notification_webhook_destinations
    SET consecutive_failures = consecutive_failures + 1,
        last_error = p_error,
        updated_at = now()
    WHERE id = v_row.destination_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_notification_webhook_result(uuid, boolean, text) FROM anon, authenticated;