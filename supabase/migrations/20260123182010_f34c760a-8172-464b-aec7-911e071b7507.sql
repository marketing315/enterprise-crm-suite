
-- =====================================================
-- M1: CONTACTS, LEAD EVENTS, WEBHOOK INGESTION TABLES
-- =====================================================

-- Enum per contact status
CREATE TYPE contact_status AS ENUM ('new', 'active', 'qualified', 'unqualified', 'archived');

-- Enum per lead event source type
CREATE TYPE lead_source_type AS ENUM ('webhook', 'manual', 'import', 'api');

-- =====================================================
-- WEBHOOK SOURCES (configurazione sorgenti esterne)
-- =====================================================
CREATE TABLE public.webhook_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  api_key_hash TEXT NOT NULL,
  mapping JSONB DEFAULT '{}'::jsonb,
  rate_limit_per_min INT NOT NULL DEFAULT 60,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(brand_id, name)
);

-- Trigger updated_at
CREATE TRIGGER update_webhook_sources_updated_at
  BEFORE UPDATE ON public.webhook_sources
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.webhook_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage webhook sources"
  ON public.webhook_sources FOR ALL
  USING (has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'))
  WITH CHECK (has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'));

CREATE POLICY "Users can view webhook sources"
  ON public.webhook_sources FOR SELECT
  USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

-- =====================================================
-- RATE LIMIT BUCKETS (token bucket per source)
-- =====================================================
CREATE TABLE public.rate_limit_buckets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES public.webhook_sources(id) ON DELETE CASCADE,
  tokens INT NOT NULL,
  max_tokens INT NOT NULL,
  refill_rate INT NOT NULL,
  last_refill_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(source_id)
);

-- RLS (solo service role accede)
ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- CONTACTS (contatti per brand)
-- =====================================================
CREATE TABLE public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  city TEXT,
  cap TEXT,
  status contact_status NOT NULL DEFAULT 'new',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index per ricerche
CREATE INDEX idx_contacts_brand ON public.contacts(brand_id);
CREATE INDEX idx_contacts_email ON public.contacts(email) WHERE email IS NOT NULL;
CREATE INDEX idx_contacts_status ON public.contacts(brand_id, status);

-- Trigger updated_at
CREATE TRIGGER update_contacts_updated_at
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view contacts in their brands"
  ON public.contacts FOR SELECT
  USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

CREATE POLICY "Users can insert contacts in their brands"
  ON public.contacts FOR INSERT
  WITH CHECK (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

CREATE POLICY "Users can update contacts in their brands"
  ON public.contacts FOR UPDATE
  USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

-- =====================================================
-- CONTACT PHONES (telefoni normalizzati per dedup)
-- =====================================================
CREATE TABLE public.contact_phones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  phone_raw TEXT NOT NULL,
  phone_normalized TEXT NOT NULL,
  country_code TEXT NOT NULL DEFAULT 'IT',
  assumed_country BOOLEAN NOT NULL DEFAULT false,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index per deduplicazione
CREATE INDEX idx_contact_phones_normalized ON public.contact_phones(brand_id, phone_normalized) WHERE is_active = true;
CREATE INDEX idx_contact_phones_contact ON public.contact_phones(contact_id);

-- RLS
ALTER TABLE public.contact_phones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view phones in their brands"
  ON public.contact_phones FOR SELECT
  USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

CREATE POLICY "Users can insert phones in their brands"
  ON public.contact_phones FOR INSERT
  WITH CHECK (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

CREATE POLICY "Users can update phones in their brands"
  ON public.contact_phones FOR UPDATE
  USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

-- =====================================================
-- LEAD EVENTS (append-only log eventi)
-- =====================================================
CREATE TABLE public.lead_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  deal_id UUID,
  source lead_source_type NOT NULL,
  source_name TEXT,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ai_priority INT,
  ai_model_version TEXT,
  ai_prompt_version TEXT,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index per query
CREATE INDEX idx_lead_events_brand ON public.lead_events(brand_id);
CREATE INDEX idx_lead_events_contact ON public.lead_events(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX idx_lead_events_received ON public.lead_events(brand_id, received_at DESC);
CREATE INDEX idx_lead_events_deal ON public.lead_events(deal_id) WHERE deal_id IS NOT NULL;

-- RLS
ALTER TABLE public.lead_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view lead events in their brands"
  ON public.lead_events FOR SELECT
  USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

CREATE POLICY "Users can insert lead events in their brands"
  ON public.lead_events FOR INSERT
  WITH CHECK (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

-- =====================================================
-- INCOMING REQUESTS (log raw webhook requests)
-- =====================================================
CREATE TABLE public.incoming_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES public.webhook_sources(id) ON DELETE SET NULL,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  raw_body JSONB NOT NULL,
  headers JSONB,
  ip_address TEXT,
  processed BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  lead_event_id UUID REFERENCES public.lead_events(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index
CREATE INDEX idx_incoming_requests_source ON public.incoming_requests(source_id);
CREATE INDEX idx_incoming_requests_unprocessed ON public.incoming_requests(brand_id, processed) WHERE processed = false;

-- RLS (solo per lettura admin)
ALTER TABLE public.incoming_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view incoming requests"
  ON public.incoming_requests FOR SELECT
  USING (has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'));

-- =====================================================
-- CONSUME RATE LIMIT TOKEN (funzione atomica)
-- =====================================================
CREATE OR REPLACE FUNCTION public.consume_rate_limit_token(p_source_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bucket RECORD;
  v_elapsed_minutes NUMERIC;
  v_tokens_to_add INT;
  v_new_tokens INT;
BEGIN
  -- 1. Upsert: crea bucket se non esiste
  INSERT INTO public.rate_limit_buckets (source_id, tokens, max_tokens, refill_rate)
  SELECT 
    p_source_id,
    ws.rate_limit_per_min,
    ws.rate_limit_per_min,
    ws.rate_limit_per_min
  FROM public.webhook_sources ws
  WHERE ws.id = p_source_id
  ON CONFLICT (source_id) DO NOTHING;

  -- 2. Lock e fetch
  SELECT tokens, max_tokens, refill_rate, last_refill_at
  INTO v_bucket
  FROM public.rate_limit_buckets
  WHERE source_id = p_source_id
  FOR UPDATE;

  -- 3. Source non esiste
  IF v_bucket IS NULL THEN
    RETURN FALSE;
  END IF;

  -- 4. Calcola refill
  v_elapsed_minutes := EXTRACT(EPOCH FROM (now() - v_bucket.last_refill_at)) / 60.0;
  v_tokens_to_add := FLOOR(v_elapsed_minutes * v_bucket.refill_rate);
  v_new_tokens := LEAST(v_bucket.tokens + v_tokens_to_add, v_bucket.max_tokens);

  -- 5. Consuma token
  IF v_new_tokens > 0 THEN
    UPDATE public.rate_limit_buckets
    SET 
      tokens = v_new_tokens - 1,
      last_refill_at = CASE 
        WHEN v_tokens_to_add > 0 THEN now() 
        ELSE last_refill_at 
      END
    WHERE source_id = p_source_id;
    
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

-- =====================================================
-- FIND OR CREATE CONTACT (per deduplicazione)
-- =====================================================
CREATE OR REPLACE FUNCTION public.find_or_create_contact(
  p_brand_id UUID,
  p_phone_normalized TEXT,
  p_phone_raw TEXT,
  p_country_code TEXT,
  p_assumed_country BOOLEAN,
  p_first_name TEXT DEFAULT NULL,
  p_last_name TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_cap TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contact_id UUID;
BEGIN
  -- 1. Cerca contatto esistente per telefono normalizzato
  SELECT cp.contact_id INTO v_contact_id
  FROM public.contact_phones cp
  WHERE cp.brand_id = p_brand_id 
    AND cp.phone_normalized = p_phone_normalized
    AND cp.is_active = true
  LIMIT 1;

  -- 2. Se trovato, ritorna ID
  IF v_contact_id IS NOT NULL THEN
    RETURN v_contact_id;
  END IF;

  -- 3. Crea nuovo contatto
  INSERT INTO public.contacts (brand_id, first_name, last_name, email, city, cap)
  VALUES (p_brand_id, p_first_name, p_last_name, p_email, p_city, p_cap)
  RETURNING id INTO v_contact_id;

  -- 4. Crea phone record
  INSERT INTO public.contact_phones (
    brand_id, contact_id, phone_raw, phone_normalized, 
    country_code, assumed_country, is_primary
  )
  VALUES (
    p_brand_id, v_contact_id, p_phone_raw, p_phone_normalized,
    p_country_code, p_assumed_country, true
  );

  RETURN v_contact_id;
END;
$$;
