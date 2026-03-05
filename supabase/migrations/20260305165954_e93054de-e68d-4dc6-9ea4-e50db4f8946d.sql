
-- =====================================================
-- 1) ENUM for household person role
-- =====================================================
DO $$ BEGIN
  CREATE TYPE public.household_person_role AS ENUM ('requester', 'beneficiary', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =====================================================
-- 2) household_people: persone collegate a un contatto household
-- =====================================================
CREATE TABLE IF NOT EXISTS public.household_people (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  role household_person_role NOT NULL DEFAULT 'other',
  first_name TEXT,
  last_name TEXT,
  phone_raw TEXT,
  phone_normalized TEXT,
  pacemaker_status TEXT,
  has_device BOOLEAN,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_household_people_contact ON public.household_people(contact_id);
CREATE INDEX IF NOT EXISTS idx_household_people_phone ON public.household_people(phone_normalized) WHERE phone_normalized IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_household_people_brand ON public.household_people(brand_id);

ALTER TABLE public.household_people ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view household people for their brands"
  ON public.household_people FOR SELECT TO authenticated
  USING (
    brand_id = ANY(public.get_user_brand_ids(public.get_user_id(auth.uid())))
  );

CREATE POLICY "Service role can manage household people"
  ON public.household_people FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =====================================================
-- 3) keplero_interactions: append-only event log
-- =====================================================
CREATE TABLE IF NOT EXISTS public.keplero_interactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  requester_person_id UUID REFERENCES public.household_people(id) ON DELETE SET NULL,
  beneficiary_person_id UUID REFERENCES public.household_people(id) ON DELETE SET NULL,
  esito_chiamata TEXT,
  motivo_contatto TEXT,
  motivo_rifiuto TEXT,
  disponibilita_orarie TEXT,
  fissato_keplero BOOLEAN NOT NULL DEFAULT false,
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  fingerprint TEXT UNIQUE,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_keplero_interactions_contact ON public.keplero_interactions(contact_id);
CREATE INDEX IF NOT EXISTS idx_keplero_interactions_brand ON public.keplero_interactions(brand_id);
CREATE INDEX IF NOT EXISTS idx_keplero_interactions_fingerprint ON public.keplero_interactions(fingerprint) WHERE fingerprint IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_keplero_interactions_created ON public.keplero_interactions(created_at DESC);

ALTER TABLE public.keplero_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view keplero interactions for their brands"
  ON public.keplero_interactions FOR SELECT TO authenticated
  USING (
    brand_id = ANY(public.get_user_brand_ids(public.get_user_id(auth.uid())))
  );

CREATE POLICY "Service role can manage keplero interactions"
  ON public.keplero_interactions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =====================================================
-- 4) Add "Fissato" pipeline stage (global, order_index=2)
-- =====================================================
INSERT INTO public.pipeline_stages (brand_id, name, order_index, is_active)
VALUES (NULL, 'Fissato', 2, true)
ON CONFLICT DO NOTHING;

-- =====================================================
-- 5) RPC: find_or_link_household_person
-- =====================================================
CREATE OR REPLACE FUNCTION public.find_or_link_household_person(
  p_contact_id UUID,
  p_brand_id UUID,
  p_role household_person_role,
  p_phone_raw TEXT,
  p_phone_normalized TEXT,
  p_first_name TEXT DEFAULT NULL,
  p_last_name TEXT DEFAULT NULL,
  p_pacemaker_status TEXT DEFAULT NULL,
  p_has_device BOOLEAN DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_person_id UUID;
BEGIN
  IF p_phone_normalized IS NOT NULL AND p_phone_normalized != '' THEN
    SELECT id INTO v_person_id
    FROM public.household_people
    WHERE contact_id = p_contact_id
      AND phone_normalized = p_phone_normalized
    LIMIT 1;
  END IF;
  
  IF v_person_id IS NOT NULL THEN
    UPDATE public.household_people
    SET
      role = p_role,
      first_name = COALESCE(NULLIF(p_first_name, ''), first_name),
      last_name = COALESCE(NULLIF(p_last_name, ''), last_name),
      pacemaker_status = COALESCE(NULLIF(p_pacemaker_status, ''), pacemaker_status),
      has_device = COALESCE(p_has_device, has_device),
      updated_at = now()
    WHERE id = v_person_id;
    RETURN v_person_id;
  END IF;
  
  INSERT INTO public.household_people (
    contact_id, brand_id, role, first_name, last_name,
    phone_raw, phone_normalized, pacemaker_status, has_device
  ) VALUES (
    p_contact_id, p_brand_id, p_role, p_first_name, p_last_name,
    p_phone_raw, p_phone_normalized, p_pacemaker_status, p_has_device
  )
  RETURNING id INTO v_person_id;
  
  RETURN v_person_id;
END;
$$;
