-- =====================================================
-- STEP 1: DATA INTEGRITY + CONCURRENCY SAFE
-- =====================================================

-- 1) UNIQUE constraint: un solo telefono normalizzato per brand
-- Previene duplicati anche con webhook concorrenti
CREATE UNIQUE INDEX IF NOT EXISTS ux_contact_phones_brand_phone
ON public.contact_phones (brand_id, phone_normalized)
WHERE is_active = true;

-- 2) PARTIAL UNIQUE: un solo deal "open" per contatto per brand
-- Impedisce race condition che crea 2 deal aperti
CREATE UNIQUE INDEX IF NOT EXISTS ux_deals_one_open_per_contact
ON public.deals (brand_id, contact_id)
WHERE status IN ('open', 'reopened_for_support');

-- =====================================================
-- 3) RPC ATOMICA: find_or_create_contact con ON CONFLICT
-- Pattern: INSERT ON CONFLICT poi SELECT (no race condition)
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
  v_phone_id UUID;
BEGIN
  -- STEP 1: Prova a inserire il telefono con ON CONFLICT
  -- Se esiste già, otteniamo l'ID del contatto esistente
  INSERT INTO public.contact_phones (
    brand_id, contact_id, phone_raw, phone_normalized, 
    country_code, assumed_country, is_primary
  )
  VALUES (
    p_brand_id, 
    gen_random_uuid(), -- placeholder, sarà sovrascritto se nuovo
    p_phone_raw, 
    p_phone_normalized,
    p_country_code, 
    p_assumed_country, 
    true
  )
  ON CONFLICT (brand_id, phone_normalized) WHERE is_active = true
  DO NOTHING
  RETURNING id, contact_id INTO v_phone_id, v_contact_id;

  -- STEP 2: Se insert ha funzionato (nuovo telefono), crea contatto e aggiorna phone
  IF v_phone_id IS NOT NULL THEN
    -- Crea il contatto
    INSERT INTO public.contacts (brand_id, first_name, last_name, email, city, cap)
    VALUES (p_brand_id, p_first_name, p_last_name, p_email, p_city, p_cap)
    RETURNING id INTO v_contact_id;
    
    -- Aggiorna il phone record col vero contact_id
    UPDATE public.contact_phones 
    SET contact_id = v_contact_id 
    WHERE id = v_phone_id;
    
    RETURN v_contact_id;
  END IF;

  -- STEP 3: Telefono già esistente, recupera contact_id
  SELECT cp.contact_id INTO v_contact_id
  FROM public.contact_phones cp
  WHERE cp.brand_id = p_brand_id 
    AND cp.phone_normalized = p_phone_normalized
    AND cp.is_active = true
  LIMIT 1;

  -- STEP 4: Opzionale - aggiorna dati mancanti sul contatto esistente
  IF v_contact_id IS NOT NULL THEN
    UPDATE public.contacts
    SET 
      first_name = COALESCE(NULLIF(first_name, ''), p_first_name),
      last_name = COALESCE(NULLIF(last_name, ''), p_last_name),
      email = COALESCE(NULLIF(email, ''), p_email),
      city = COALESCE(NULLIF(city, ''), p_city),
      cap = COALESCE(NULLIF(cap, ''), p_cap),
      updated_at = now()
    WHERE id = v_contact_id;
  END IF;

  RETURN v_contact_id;
END;
$$;

-- =====================================================
-- 4) RPC ATOMICA: find_or_create_deal con ON CONFLICT
-- Sfrutta l'indice parziale per atomicità
-- =====================================================
CREATE OR REPLACE FUNCTION public.find_or_create_deal(
  p_brand_id UUID,
  p_contact_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deal_id UUID;
  v_initial_stage_id UUID;
BEGIN
  -- 1. Trova lo stage iniziale per il brand
  SELECT id INTO v_initial_stage_id
  FROM public.pipeline_stages
  WHERE brand_id = p_brand_id 
    AND is_active = true
  ORDER BY order_index ASC
  LIMIT 1;

  -- 2. Prova INSERT con ON CONFLICT (sfrutta indice parziale)
  INSERT INTO public.deals (brand_id, contact_id, current_stage_id, status)
  VALUES (p_brand_id, p_contact_id, v_initial_stage_id, 'open')
  ON CONFLICT (brand_id, contact_id) WHERE status IN ('open', 'reopened_for_support')
  DO NOTHING
  RETURNING id INTO v_deal_id;

  -- 3. Se INSERT ha funzionato (nuovo deal), registra history
  IF v_deal_id IS NOT NULL THEN
    INSERT INTO public.deal_stage_history (deal_id, from_stage_id, to_stage_id, notes)
    VALUES (v_deal_id, NULL, v_initial_stage_id, 'Deal creato automaticamente');
    
    RETURN v_deal_id;
  END IF;

  -- 4. Deal già esistente, recupera ID
  SELECT id INTO v_deal_id
  FROM public.deals
  WHERE brand_id = p_brand_id 
    AND contact_id = p_contact_id
    AND status IN ('open', 'reopened_for_support')
  LIMIT 1;

  RETURN v_deal_id;
END;
$$;