-- Fix find_or_create_contact RPC: create contact FIRST, then phone record
-- The previous version tried to insert phone with placeholder UUID which violated FK constraint

CREATE OR REPLACE FUNCTION public.find_or_create_contact(
  p_brand_id uuid, 
  p_phone_normalized text, 
  p_phone_raw text, 
  p_country_code text, 
  p_assumed_country boolean, 
  p_first_name text DEFAULT NULL::text, 
  p_last_name text DEFAULT NULL::text, 
  p_email text DEFAULT NULL::text, 
  p_city text DEFAULT NULL::text, 
  p_cap text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_contact_id UUID;
  v_existing_contact_id UUID;
BEGIN
  -- STEP 1: Check if phone already exists for this brand
  SELECT cp.contact_id INTO v_existing_contact_id
  FROM public.contact_phones cp
  WHERE cp.brand_id = p_brand_id 
    AND cp.phone_normalized = p_phone_normalized
    AND cp.is_active = true
  LIMIT 1;

  -- STEP 2: If phone exists, update contact and return
  IF v_existing_contact_id IS NOT NULL THEN
    -- Update missing fields on existing contact
    UPDATE public.contacts
    SET 
      first_name = COALESCE(NULLIF(first_name, ''), p_first_name),
      last_name = COALESCE(NULLIF(last_name, ''), p_last_name),
      email = COALESCE(NULLIF(email, ''), p_email),
      city = COALESCE(NULLIF(city, ''), p_city),
      cap = COALESCE(NULLIF(cap, ''), p_cap),
      updated_at = now()
    WHERE id = v_existing_contact_id;
    
    RETURN v_existing_contact_id;
  END IF;

  -- STEP 3: New phone - create contact FIRST
  INSERT INTO public.contacts (brand_id, first_name, last_name, email, city, cap)
  VALUES (p_brand_id, p_first_name, p_last_name, p_email, p_city, p_cap)
  RETURNING id INTO v_contact_id;
  
  -- STEP 4: Create phone record linked to the new contact
  INSERT INTO public.contact_phones (
    brand_id, contact_id, phone_raw, phone_normalized, 
    country_code, assumed_country, is_primary
  )
  VALUES (
    p_brand_id, 
    v_contact_id,
    p_phone_raw, 
    p_phone_normalized,
    p_country_code, 
    p_assumed_country, 
    true
  )
  ON CONFLICT (brand_id, phone_normalized) WHERE is_active = true
  DO NOTHING;

  RETURN v_contact_id;
END;
$function$;