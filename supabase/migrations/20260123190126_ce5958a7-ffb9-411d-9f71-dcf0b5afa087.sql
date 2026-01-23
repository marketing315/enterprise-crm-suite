
-- M1.1: Indici per performance ricerca
CREATE INDEX IF NOT EXISTS idx_contacts_brand_email ON public.contacts(brand_id, email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_brand_lastname ON public.contacts(brand_id, last_name) WHERE last_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contact_phones_brand_normalized ON public.contact_phones(brand_id, phone_normalized);

-- Funzione per cercare contatti (nome, telefono, email)
CREATE OR REPLACE FUNCTION public.search_contacts(
  p_brand_id UUID,
  p_query TEXT,
  p_status contact_status DEFAULT NULL,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  city TEXT,
  cap TEXT,
  status contact_status,
  notes TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  primary_phone TEXT,
  match_type TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized_query TEXT;
BEGIN
  -- Normalizza query per ricerca telefono (solo cifre)
  v_normalized_query := regexp_replace(p_query, '[^0-9]', '', 'g');

  RETURN QUERY
  WITH matched_contacts AS (
    -- Match per telefono
    SELECT DISTINCT c.id, 'phone'::TEXT AS match_type
    FROM contacts c
    JOIN contact_phones cp ON cp.contact_id = c.id AND cp.brand_id = c.brand_id
    WHERE c.brand_id = p_brand_id
      AND cp.is_active = true
      AND cp.phone_normalized LIKE v_normalized_query || '%'
      AND (p_status IS NULL OR c.status = p_status)
    
    UNION
    
    -- Match per email
    SELECT DISTINCT c.id, 'email'::TEXT AS match_type
    FROM contacts c
    WHERE c.brand_id = p_brand_id
      AND c.email ILIKE '%' || p_query || '%'
      AND (p_status IS NULL OR c.status = p_status)
    
    UNION
    
    -- Match per nome/cognome
    SELECT DISTINCT c.id, 'name'::TEXT AS match_type
    FROM contacts c
    WHERE c.brand_id = p_brand_id
      AND (
        c.first_name ILIKE '%' || p_query || '%'
        OR c.last_name ILIKE '%' || p_query || '%'
        OR (c.first_name || ' ' || c.last_name) ILIKE '%' || p_query || '%'
      )
      AND (p_status IS NULL OR c.status = p_status)
  )
  SELECT 
    c.id,
    c.first_name,
    c.last_name,
    c.email,
    c.city,
    c.cap,
    c.status,
    c.notes,
    c.created_at,
    c.updated_at,
    (SELECT cp.phone_raw FROM contact_phones cp 
     WHERE cp.contact_id = c.id AND cp.is_primary = true AND cp.is_active = true 
     LIMIT 1) AS primary_phone,
    mc.match_type
  FROM contacts c
  JOIN matched_contacts mc ON mc.id = c.id
  ORDER BY c.updated_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Funzione per check duplicato telefono
CREATE OR REPLACE FUNCTION public.check_phone_duplicate(
  p_brand_id UUID,
  p_phone_normalized TEXT
)
RETURNS TABLE (
  contact_id UUID,
  first_name TEXT,
  last_name TEXT,
  email TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.first_name, c.last_name, c.email
  FROM contact_phones cp
  JOIN contacts c ON c.id = cp.contact_id
  WHERE cp.brand_id = p_brand_id
    AND cp.phone_normalized = p_phone_normalized
    AND cp.is_active = true
  LIMIT 1;
$$;
