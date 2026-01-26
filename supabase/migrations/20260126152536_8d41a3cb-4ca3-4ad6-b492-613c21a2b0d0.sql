-- M8: Outbound Webhook System
-- Step A: Foundation schema with RLS and idempotency

-- Enum for delivery status
CREATE TYPE public.webhook_delivery_status AS ENUM ('pending', 'sending', 'success', 'failed');

-- Enum for supported event types
CREATE TYPE public.webhook_event_type AS ENUM (
  'ticket.created',
  'ticket.updated', 
  'ticket.assigned',
  'ticket.status_changed',
  'ticket.priority_changed',
  'ticket.sla_breached',
  'ticket.resolved',
  'ticket.closed',
  'contact.created',
  'contact.updated',
  'deal.created',
  'deal.stage_changed',
  'deal.closed'
);

-- Outbound webhook configurations per brand
CREATE TABLE public.outbound_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  event_types webhook_event_type[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.outbound_webhooks ENABLE ROW LEVEL SECURITY;

-- RLS: brand isolation
CREATE POLICY "Users can view webhooks in their brands"
  ON public.outbound_webhooks FOR SELECT
  USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

CREATE POLICY "Admins can manage webhooks in their brands"
  ON public.outbound_webhooks FOR ALL
  USING (has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'))
  WITH CHECK (has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'));

-- Outbound webhook deliveries (outbox pattern)
CREATE TABLE public.outbound_webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID NOT NULL REFERENCES public.outbound_webhooks(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  event_type webhook_event_type NOT NULL,
  event_id UUID NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  status webhook_delivery_status NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 10,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT,
  response_status INTEGER,
  response_body TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.outbound_webhook_deliveries ENABLE ROW LEVEL SECURITY;

-- RLS: brand isolation (read-only for users, system writes)
CREATE POLICY "Users can view deliveries in their brands"
  ON public.outbound_webhook_deliveries FOR SELECT
  USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

CREATE POLICY "Admins can manage deliveries in their brands"
  ON public.outbound_webhook_deliveries FOR ALL
  USING (has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'))
  WITH CHECK (has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'));

-- CRITICAL: Idempotency unique constraint
CREATE UNIQUE INDEX idx_deliveries_idempotency 
  ON public.outbound_webhook_deliveries(webhook_id, event_id);

-- Performance indexes
CREATE INDEX idx_deliveries_pending_queue 
  ON public.outbound_webhook_deliveries(next_attempt_at, status) 
  WHERE status IN ('pending', 'failed');

CREATE INDEX idx_deliveries_brand_status 
  ON public.outbound_webhook_deliveries(brand_id, status, created_at DESC);

CREATE INDEX idx_deliveries_webhook_id 
  ON public.outbound_webhook_deliveries(webhook_id, created_at DESC);

CREATE INDEX idx_webhooks_brand_active 
  ON public.outbound_webhooks(brand_id, is_active) 
  WHERE is_active = true;

-- Trigger for updated_at on outbound_webhooks
CREATE TRIGGER update_outbound_webhooks_updated_at
  BEFORE UPDATE ON public.outbound_webhooks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for updated_at on outbound_webhook_deliveries
CREATE TRIGGER update_outbound_webhook_deliveries_updated_at
  BEFORE UPDATE ON public.outbound_webhook_deliveries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Function to enqueue webhook delivery (called from triggers)
CREATE OR REPLACE FUNCTION public.enqueue_webhook_delivery(
  p_brand_id UUID,
  p_event_type webhook_event_type,
  p_event_id UUID,
  p_payload JSONB
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_webhook RECORD;
  v_count INTEGER := 0;
BEGIN
  -- Find all active webhooks for this brand that subscribe to this event type
  FOR v_webhook IN
    SELECT id, brand_id
    FROM outbound_webhooks
    WHERE brand_id = p_brand_id
      AND is_active = true
      AND p_event_type = ANY(event_types)
  LOOP
    -- Insert delivery (idempotency handled by unique index)
    INSERT INTO outbound_webhook_deliveries (
      webhook_id, brand_id, event_type, event_id, payload, status, next_attempt_at
    ) VALUES (
      v_webhook.id, p_brand_id, p_event_type, p_event_id, p_payload, 'pending', now()
    )
    ON CONFLICT (webhook_id, event_id) DO NOTHING;
    
    IF FOUND THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;
  
  RETURN v_count;
END;
$$;

-- Function to get next batch of deliveries to process (with lock)
CREATE OR REPLACE FUNCTION public.claim_webhook_deliveries(
  p_batch_size INTEGER DEFAULT 10
) RETURNS SETOF outbound_webhook_deliveries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE outbound_webhook_deliveries
  SET 
    status = 'sending',
    updated_at = now()
  WHERE id IN (
    SELECT id
    FROM outbound_webhook_deliveries
    WHERE status IN ('pending', 'failed')
      AND next_attempt_at <= now()
      AND attempt_count < max_attempts
    ORDER BY next_attempt_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

-- Function to record delivery result
CREATE OR REPLACE FUNCTION public.record_delivery_result(
  p_delivery_id UUID,
  p_success BOOLEAN,
  p_response_status INTEGER DEFAULT NULL,
  p_response_body TEXT DEFAULT NULL,
  p_error TEXT DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt_count INTEGER;
  v_max_attempts INTEGER;
  v_next_delay INTERVAL;
  v_backoff_intervals INTERVAL[] := ARRAY[
    '1 minute'::interval,
    '5 minutes'::interval,
    '15 minutes'::interval,
    '1 hour'::interval,
    '6 hours'::interval,
    '24 hours'::interval
  ];
BEGIN
  -- Get current attempt info
  SELECT attempt_count, max_attempts INTO v_attempt_count, v_max_attempts
  FROM outbound_webhook_deliveries
  WHERE id = p_delivery_id;
  
  IF p_success THEN
    UPDATE outbound_webhook_deliveries
    SET 
      status = 'success',
      attempt_count = v_attempt_count + 1,
      response_status = p_response_status,
      response_body = LEFT(p_response_body, 10000), -- Limit stored response
      updated_at = now()
    WHERE id = p_delivery_id;
  ELSE
    -- Calculate next attempt with exponential backoff + jitter
    v_next_delay := COALESCE(
      v_backoff_intervals[LEAST(v_attempt_count + 1, array_length(v_backoff_intervals, 1))],
      '24 hours'::interval
    );
    -- Add jitter (0-20% of delay)
    v_next_delay := v_next_delay + (random() * 0.2 * EXTRACT(EPOCH FROM v_next_delay)) * interval '1 second';
    
    UPDATE outbound_webhook_deliveries
    SET 
      status = CASE 
        WHEN v_attempt_count + 1 >= v_max_attempts THEN 'failed'::webhook_delivery_status
        ELSE 'failed'::webhook_delivery_status
      END,
      attempt_count = v_attempt_count + 1,
      next_attempt_at = CASE 
        WHEN v_attempt_count + 1 >= v_max_attempts THEN NULL
        ELSE now() + v_next_delay
      END,
      last_error = p_error,
      response_status = p_response_status,
      response_body = LEFT(p_response_body, 10000),
      updated_at = now()
    WHERE id = p_delivery_id;
  END IF;
END;
$$;