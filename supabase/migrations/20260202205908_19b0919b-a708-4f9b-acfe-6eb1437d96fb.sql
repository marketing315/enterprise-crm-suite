-- =====================================================
-- Meta CAPI: Full Database Migration
-- =====================================================

-- 1. Extend contacts with marketing consent
ALTER TABLE public.contacts 
ADD COLUMN IF NOT EXISTS marketing_consent BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS marketing_consent_at TIMESTAMPTZ;

-- 2. Extend meta_apps with CAPI configuration
ALTER TABLE public.meta_apps
ADD COLUMN IF NOT EXISTS pixel_id TEXT,
ADD COLUMN IF NOT EXISTS capi_token_key TEXT,
ADD COLUMN IF NOT EXISTS capi_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS capi_test_event_code TEXT;

-- 3. Create contact_tracking table (1:1 with contacts)
CREATE TABLE IF NOT EXISTS public.contact_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL UNIQUE REFERENCES public.contacts(id) ON DELETE CASCADE,
  fbp TEXT,
  fbc TEXT,
  gclid TEXT,
  wbraid TEXT,
  gbraid TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  client_ip TEXT,
  client_user_agent TEXT,
  first_touch_source TEXT,
  first_touch_at TIMESTAMPTZ,
  last_touch_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for contact_tracking
CREATE INDEX IF NOT EXISTS idx_contact_tracking_brand ON public.contact_tracking(brand_id);
CREATE INDEX IF NOT EXISTS idx_contact_tracking_gclid ON public.contact_tracking(gclid) WHERE gclid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contact_tracking_fbp ON public.contact_tracking(fbp) WHERE fbp IS NOT NULL;

-- RLS for contact_tracking
ALTER TABLE public.contact_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view tracking in their brands"
ON public.contact_tracking FOR SELECT
USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

CREATE POLICY "Users can insert tracking in their brands"
ON public.contact_tracking FOR INSERT
WITH CHECK (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

CREATE POLICY "Users can update tracking in their brands"
ON public.contact_tracking FOR UPDATE
USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

-- 4. Create CAPI event status enum
DO $$ BEGIN
  CREATE TYPE public.meta_capi_status AS ENUM (
    'pending',
    'processing',
    'sent',
    'failed',
    'skipped'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 5. Create meta_capi_event_queue table
CREATE TABLE IF NOT EXISTS public.meta_capi_event_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  meta_app_id UUID NOT NULL REFERENCES public.meta_apps(id) ON DELETE CASCADE,
  event_name TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_time TIMESTAMPTZ NOT NULL,
  action_source TEXT NOT NULL DEFAULT 'website',
  user_data JSONB,
  custom_data JSONB,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  lead_event_id UUID REFERENCES public.lead_events(id) ON DELETE SET NULL,
  consent_snapshot BOOLEAN NOT NULL DEFAULT false,
  status public.meta_capi_status NOT NULL DEFAULT 'pending',
  processing_at TIMESTAMPTZ,
  processing_by TEXT,
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  last_error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (brand_id, event_id)
);

-- Indexes for queue processing
CREATE INDEX IF NOT EXISTS idx_capi_queue_status_created ON public.meta_capi_event_queue(status, created_at) 
  WHERE status IN ('pending', 'failed');
CREATE INDEX IF NOT EXISTS idx_capi_queue_brand_event ON public.meta_capi_event_queue(brand_id, event_name, created_at);
CREATE INDEX IF NOT EXISTS idx_capi_queue_meta_app ON public.meta_capi_event_queue(meta_app_id);

-- RLS for meta_capi_event_queue
ALTER TABLE public.meta_capi_event_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view CAPI queue"
ON public.meta_capi_event_queue FOR SELECT
USING (has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role) 
       OR has_role(get_user_id(auth.uid()), 'ceo'::app_role));

-- 6. Trigger function: Queue Lead event
CREATE OR REPLACE FUNCTION public.queue_capi_lead_event() 
RETURNS TRIGGER AS $$
DECLARE
  v_meta_app RECORD;
  v_consent BOOLEAN;
  v_action_source TEXT;
BEGIN
  -- Only if contact_id present
  IF NEW.contact_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Find meta_app with CAPI enabled for this brand
  SELECT id, pixel_id INTO v_meta_app
  FROM meta_apps
  WHERE brand_id = NEW.brand_id
    AND capi_enabled = true
    AND pixel_id IS NOT NULL
  LIMIT 1;

  IF v_meta_app.id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check consent
  SELECT marketing_consent INTO v_consent
  FROM contacts WHERE id = NEW.contact_id;

  -- Determine action_source from lead_events.source
  v_action_source := CASE
    WHEN NEW.source = 'manual' THEN 'system_generated'
    ELSE 'website'
  END;

  INSERT INTO meta_capi_event_queue (
    brand_id, meta_app_id, event_name, event_id,
    event_time, action_source, contact_id, deal_id, lead_event_id,
    consent_snapshot, status
  ) VALUES (
    NEW.brand_id, v_meta_app.id, 'Lead',
    'lead_' || NEW.id,
    NEW.occurred_at, v_action_source, NEW.contact_id, NEW.deal_id, NEW.id,
    COALESCE(v_consent, false),
    CASE WHEN v_consent = true THEN 'pending' ELSE 'skipped' END
  )
  ON CONFLICT (brand_id, event_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_queue_capi_lead ON public.lead_events;
CREATE TRIGGER trigger_queue_capi_lead
AFTER INSERT ON public.lead_events
FOR EACH ROW EXECUTE FUNCTION queue_capi_lead_event();

-- 7. Trigger function: Queue Purchase event (Deal Won)
CREATE OR REPLACE FUNCTION public.queue_capi_purchase_event() 
RETURNS TRIGGER AS $$
DECLARE
  v_meta_app RECORD;
  v_consent BOOLEAN;
BEGIN
  -- Only when status changes to 'won'
  IF NEW.status != 'won' OR (OLD.status IS NOT NULL AND OLD.status = 'won') THEN
    RETURN NEW;
  END IF;

  -- Find meta_app with CAPI enabled
  SELECT id, pixel_id INTO v_meta_app
  FROM meta_apps
  WHERE brand_id = NEW.brand_id
    AND capi_enabled = true
    AND pixel_id IS NOT NULL
  LIMIT 1;

  IF v_meta_app.id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check consent
  SELECT marketing_consent INTO v_consent
  FROM contacts WHERE id = NEW.contact_id;

  INSERT INTO meta_capi_event_queue (
    brand_id, meta_app_id, event_name, event_id,
    event_time, action_source, contact_id, deal_id,
    consent_snapshot, status
  ) VALUES (
    NEW.brand_id, v_meta_app.id, 'Purchase',
    'purchase_' || NEW.id,
    COALESCE(NEW.closed_at, NOW()),
    'system_generated',
    NEW.contact_id, NEW.id,
    COALESCE(v_consent, false),
    CASE WHEN v_consent = true THEN 'pending' ELSE 'skipped' END
  )
  ON CONFLICT (brand_id, event_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_queue_capi_purchase ON public.deals;
CREATE TRIGGER trigger_queue_capi_purchase
AFTER UPDATE ON public.deals
FOR EACH ROW EXECUTE FUNCTION queue_capi_purchase_event();

-- 8. RPC: Claim CAPI events atomically (FOR UPDATE SKIP LOCKED)
CREATE OR REPLACE FUNCTION public.claim_capi_events(
  p_limit INTEGER DEFAULT 50,
  p_processing_by TEXT DEFAULT NULL
) RETURNS SETOF public.meta_capi_event_queue AS $$
BEGIN
  RETURN QUERY
  UPDATE public.meta_capi_event_queue
  SET 
    status = 'processing',
    processing_at = NOW(),
    processing_by = COALESCE(p_processing_by, gen_random_uuid()::text)
  WHERE id IN (
    SELECT id FROM public.meta_capi_event_queue
    WHERE status = 'pending'
      AND attempts < max_attempts
      AND consent_snapshot = true
    ORDER BY created_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 9. RPC: Update CAPI event status after processing
CREATE OR REPLACE FUNCTION public.update_capi_event_status(
  p_event_id UUID,
  p_status public.meta_capi_status,
  p_error TEXT DEFAULT NULL
) RETURNS void AS $$
BEGIN
  UPDATE public.meta_capi_event_queue
  SET 
    status = p_status,
    attempts = attempts + 1,
    last_error = p_error,
    sent_at = CASE WHEN p_status = 'sent' THEN NOW() ELSE sent_at END,
    processing_at = NULL,
    processing_by = NULL
  WHERE id = p_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 10. Updated_at trigger for contact_tracking
CREATE OR REPLACE FUNCTION public.update_contact_tracking_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_contact_tracking_updated_at ON public.contact_tracking;
CREATE TRIGGER trigger_contact_tracking_updated_at
BEFORE UPDATE ON public.contact_tracking
FOR EACH ROW EXECUTE FUNCTION update_contact_tracking_updated_at();