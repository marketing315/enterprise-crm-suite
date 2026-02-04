-- =============================================
-- AUTOMATION ENGINE EXTENSION - Event-Driven Webhook Processing
-- =============================================

-- 1. Inbound Events Log (raw webhook events for automation)
CREATE TABLE IF NOT EXISTS public.webhook_inbound_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  source text NOT NULL, -- 'keplero', 'sileads', 'landing', 'meta', 'inbound'
  event_type text NOT NULL, -- 'keplero.ricontatto', 'keplero.phone_enrich', etc.
  payload jsonb NOT NULL DEFAULT '{}',
  received_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'processed', 'failed', 'skipped')),
  processed_at timestamptz,
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  webhook_source_id uuid REFERENCES public.webhook_sources(id), -- link to webhook source if applicable
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for efficient processing
CREATE INDEX IF NOT EXISTS idx_webhook_inbound_events_pending 
  ON public.webhook_inbound_events(brand_id, status, received_at) 
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_webhook_inbound_events_type 
  ON public.webhook_inbound_events(brand_id, event_type, received_at);
CREATE INDEX IF NOT EXISTS idx_webhook_inbound_events_source 
  ON public.webhook_inbound_events(brand_id, source, received_at);

-- 2. Extend automation_rules with event-driven fields
ALTER TABLE public.automation_rules 
  ADD COLUMN IF NOT EXISTS trigger_event_type text,
  ADD COLUMN IF NOT EXISTS trigger_source text,
  ADD COLUMN IF NOT EXISTS conditions jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS actions jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS stop_on_failure boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS priority int NOT NULL DEFAULT 100;

-- Index for event-type based rule matching
CREATE INDEX IF NOT EXISTS idx_automation_rules_event_type 
  ON public.automation_rules(brand_id, trigger_event_type, is_active) 
  WHERE is_active = true;

-- 3. Extend automation_logs with event reference and step tracking
ALTER TABLE public.automation_logs
  ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES public.webhook_inbound_events(id),
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS finished_at timestamptz,
  ADD COLUMN IF NOT EXISTS duration_ms int,
  ADD COLUMN IF NOT EXISTS steps_log jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS created_entities jsonb DEFAULT '{}';

-- Index for event-based lookups
CREATE INDEX IF NOT EXISTS idx_automation_logs_event 
  ON public.automation_logs(event_id) 
  WHERE event_id IS NOT NULL;

-- RLS for webhook_inbound_events
ALTER TABLE public.webhook_inbound_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view inbound events for their brands"
  ON public.webhook_inbound_events FOR SELECT
  USING (public.user_belongs_to_brand(auth.uid(), brand_id));

-- Enable realtime for monitoring automation runs
ALTER PUBLICATION supabase_realtime ADD TABLE public.webhook_inbound_events;

-- Comments
COMMENT ON TABLE public.webhook_inbound_events IS 'Raw inbound webhook events log for automation processing';
COMMENT ON COLUMN public.automation_rules.trigger_event_type IS 'Event type to trigger on: keplero.ricontatto, inbound.*, etc.';
COMMENT ON COLUMN public.automation_rules.conditions IS 'DSL conditions: {"all":[{"path":"phone","op":"exists"}]}';
COMMENT ON COLUMN public.automation_rules.actions IS 'Ordered actions: [{"type":"upsert_contact","match":{"phone":"{{payload.phone}}"}}]';