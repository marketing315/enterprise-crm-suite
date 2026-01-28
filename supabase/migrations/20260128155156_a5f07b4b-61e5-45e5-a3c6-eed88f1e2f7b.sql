-- =============================================
-- Meta Lead Ads Integration: Database Schema
-- Each brand has its own Meta account configuration
-- =============================================

-- 1. Enum for meta lead event status
CREATE TYPE public.meta_lead_status AS ENUM (
  'received',    -- Webhook received, not yet fetched
  'fetched',     -- Graph API data fetched
  'ingested',    -- Successfully processed into CRM
  'duplicate',   -- Duplicate leadgen_id detected
  'error'        -- Processing failed
);

-- 2. Table: meta_lead_sources (brand -> Meta Page mapping)
CREATE TABLE public.meta_lead_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  page_id text NOT NULL,
  form_id text NULL,  -- Optional: filter to specific form
  access_token text NOT NULL,  -- Page Access Token for Graph API
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Functional unique index for brand+page+form (handles NULL form_id)
CREATE UNIQUE INDEX idx_meta_lead_sources_brand_page_form 
  ON public.meta_lead_sources(brand_id, page_id, COALESCE(form_id, ''));

-- Indexes for lookup
CREATE INDEX idx_meta_lead_sources_page_id ON public.meta_lead_sources(page_id);
CREATE INDEX idx_meta_lead_sources_brand_id ON public.meta_lead_sources(brand_id);
CREATE INDEX idx_meta_lead_sources_active ON public.meta_lead_sources(is_active) WHERE is_active = true;

-- Enable RLS
ALTER TABLE public.meta_lead_sources ENABLE ROW LEVEL SECURITY;

-- RLS: Users can view sources in their brands
CREATE POLICY "Users can view meta lead sources in their brands"
ON public.meta_lead_sources
FOR SELECT
USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

-- RLS: Only admin/ceo can manage sources
CREATE POLICY "Admins and CEOs can manage meta lead sources"
ON public.meta_lead_sources
FOR ALL
USING (
  has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role)
  OR has_role(get_user_id(auth.uid()), 'ceo'::app_role)
)
WITH CHECK (
  has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role)
  OR has_role(get_user_id(auth.uid()), 'ceo'::app_role)
);

-- Trigger for updated_at
CREATE TRIGGER trg_meta_lead_sources_updated_at
  BEFORE UPDATE ON public.meta_lead_sources
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();


-- 3. Table: meta_lead_events (deduplication + audit)
CREATE TABLE public.meta_lead_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES public.meta_lead_sources(id) ON DELETE CASCADE,
  leadgen_id text NOT NULL,  -- Meta's unique lead ID
  page_id text NOT NULL,
  form_id text NULL,
  ad_id text NULL,
  campaign_id text NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  raw_event jsonb NOT NULL,  -- Original webhook payload
  fetched_payload jsonb NULL,  -- Graph API response
  lead_event_id uuid NULL REFERENCES public.lead_events(id) ON DELETE SET NULL,
  contact_id uuid NULL REFERENCES public.contacts(id) ON DELETE SET NULL,
  status public.meta_lead_status NOT NULL DEFAULT 'received',
  error text NULL,
  processed_at timestamptz NULL,
  
  -- CRITICAL: Deduplication constraint per brand
  CONSTRAINT meta_lead_events_brand_leadgen_unique UNIQUE (brand_id, leadgen_id)
);

-- Indexes for common queries
CREATE INDEX idx_meta_lead_events_brand_received ON public.meta_lead_events(brand_id, received_at DESC);
CREATE INDEX idx_meta_lead_events_status ON public.meta_lead_events(status);
CREATE INDEX idx_meta_lead_events_source ON public.meta_lead_events(source_id);
CREATE INDEX idx_meta_lead_events_pending ON public.meta_lead_events(status, received_at) 
  WHERE status IN ('received', 'fetched', 'error');

-- Enable RLS
ALTER TABLE public.meta_lead_events ENABLE ROW LEVEL SECURITY;

-- RLS: Admins can view events in their brands
CREATE POLICY "Admins can view meta lead events"
ON public.meta_lead_events
FOR SELECT
USING (has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role));

-- No direct write access - all writes via service role / edge functions


-- 4. Function to find meta source by page_id (optionally form_id)
CREATE OR REPLACE FUNCTION public.find_meta_lead_source(
  p_page_id text,
  p_form_id text DEFAULT NULL
)
RETURNS TABLE (
  source_id uuid,
  brand_id uuid,
  access_token text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    mls.id AS source_id,
    mls.brand_id,
    mls.access_token
  FROM meta_lead_sources mls
  WHERE mls.page_id = p_page_id
    AND mls.is_active = true
    AND (
      -- Match specific form_id if provided
      (p_form_id IS NOT NULL AND mls.form_id = p_form_id)
      OR
      -- Or match source with no form_id filter (catches all forms)
      (mls.form_id IS NULL)
    )
  ORDER BY 
    -- Prefer specific form_id match over catch-all
    CASE WHEN mls.form_id IS NOT NULL THEN 0 ELSE 1 END
  LIMIT 1;
END;
$$;


-- 5. Function to insert meta lead event with dedup handling
CREATE OR REPLACE FUNCTION public.insert_meta_lead_event(
  p_brand_id uuid,
  p_source_id uuid,
  p_leadgen_id text,
  p_page_id text,
  p_form_id text,
  p_ad_id text,
  p_campaign_id text,
  p_raw_event jsonb
)
RETURNS TABLE (
  event_id uuid,
  is_duplicate boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
  v_is_duplicate boolean := false;
BEGIN
  -- Try to insert, handle unique constraint violation
  INSERT INTO meta_lead_events (
    brand_id, source_id, leadgen_id, page_id, form_id, 
    ad_id, campaign_id, raw_event, status
  )
  VALUES (
    p_brand_id, p_source_id, p_leadgen_id, p_page_id, p_form_id,
    p_ad_id, p_campaign_id, p_raw_event, 'received'
  )
  ON CONFLICT (brand_id, leadgen_id) DO UPDATE
  SET status = 'duplicate'
  RETURNING id, (xmax <> 0) INTO v_event_id, v_is_duplicate;
  
  -- If it was a conflict update, mark as duplicate
  IF v_is_duplicate THEN
    UPDATE meta_lead_events 
    SET status = 'duplicate'
    WHERE id = v_event_id;
  END IF;
  
  RETURN QUERY SELECT v_event_id, v_is_duplicate;
END;
$$;


-- 6. Function to update meta lead event after processing
CREATE OR REPLACE FUNCTION public.update_meta_lead_event_status(
  p_event_id uuid,
  p_status meta_lead_status,
  p_fetched_payload jsonb DEFAULT NULL,
  p_lead_event_id uuid DEFAULT NULL,
  p_contact_id uuid DEFAULT NULL,
  p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE meta_lead_events
  SET 
    status = p_status,
    fetched_payload = COALESCE(p_fetched_payload, fetched_payload),
    lead_event_id = COALESCE(p_lead_event_id, lead_event_id),
    contact_id = COALESCE(p_contact_id, contact_id),
    error = p_error,
    processed_at = CASE WHEN p_status IN ('ingested', 'error') THEN now() ELSE processed_at END
  WHERE id = p_event_id;
END;
$$;