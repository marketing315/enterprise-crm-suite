-- ===========================================================
-- M3: GLOBAL CONTACT SEARCH INDEX (Fixed order)
-- ===========================================================

-- Enable trigram extension FIRST
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Search index table (already created, skip if exists)
CREATE TABLE IF NOT EXISTS public.contact_search_index (
  contact_id UUID NOT NULL PRIMARY KEY REFERENCES public.contacts(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  search_text TEXT NOT NULL DEFAULT '',
  search_vector TSVECTOR,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_search_vector ON public.contact_search_index USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_search_brand ON public.contact_search_index(brand_id);
CREATE INDEX IF NOT EXISTS idx_search_text_trgm ON public.contact_search_index USING GIN(search_text gin_trgm_ops);

-- RLS
ALTER TABLE public.contact_search_index ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can search contacts via brand hierarchy"
ON public.contact_search_index
FOR SELECT
USING (public.user_can_access_brand(auth.uid(), brand_id));

-- Build search text function
CREATE OR REPLACE FUNCTION public.build_contact_search_text(p_contact_id UUID)
RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_text TEXT := '';
  v_contact RECORD;
BEGIN
  SELECT c.first_name, c.last_name, c.email, c.city, c.cap, b.name as brand_name
  INTO v_contact FROM contacts c LEFT JOIN brands b ON b.id = c.brand_id WHERE c.id = p_contact_id;
  
  IF v_contact IS NULL THEN RETURN ''; END IF;
  
  v_text := COALESCE(v_contact.first_name, '') || ' ' || COALESCE(v_contact.last_name, '') || ' ' ||
            COALESCE(v_contact.email, '') || ' ' || COALESCE(v_contact.city, '') || ' ' ||
            COALESCE(v_contact.cap, '') || ' ' || COALESCE(v_contact.brand_name, '');
  
  v_text := v_text || ' ' || COALESCE((SELECT string_agg(phone_normalized, ' ') FROM contact_phones WHERE contact_id = p_contact_id AND is_active), '');
  v_text := v_text || ' ' || COALESCE((SELECT string_agg(t.name, ' ') FROM tag_assignments ta JOIN tags t ON t.id = ta.tag_id WHERE ta.contact_id = p_contact_id), '');
  v_text := v_text || ' ' || COALESCE((SELECT string_agg(value_text, ' ') FROM contact_field_values WHERE contact_id = p_contact_id AND value_text IS NOT NULL), '');
  
  RETURN lower(regexp_replace(trim(v_text), '\s+', ' ', 'g'));
END;
$$;

-- Update index function
CREATE OR REPLACE FUNCTION public.update_contact_search_index(p_contact_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_brand_id UUID; v_search_text TEXT;
BEGIN
  SELECT brand_id INTO v_brand_id FROM contacts WHERE id = p_contact_id;
  IF v_brand_id IS NULL THEN RETURN; END IF;
  v_search_text := public.build_contact_search_text(p_contact_id);
  INSERT INTO contact_search_index (contact_id, brand_id, search_text, search_vector, updated_at)
  VALUES (p_contact_id, v_brand_id, v_search_text, to_tsvector('simple', v_search_text), now())
  ON CONFLICT (contact_id) DO UPDATE SET brand_id = EXCLUDED.brand_id, search_text = EXCLUDED.search_text, search_vector = EXCLUDED.search_vector, updated_at = now();
END;
$$;

-- Trigger function for contacts
CREATE OR REPLACE FUNCTION public.trigger_contact_search_sync() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public.update_contact_search_index(NEW.id); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_contact_search_sync ON public.contacts;
CREATE TRIGGER trg_contact_search_sync AFTER INSERT OR UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.trigger_contact_search_sync();