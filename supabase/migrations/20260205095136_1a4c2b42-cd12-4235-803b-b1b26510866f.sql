-- Fix find_or_create_contact to use contact_phones table
CREATE OR REPLACE FUNCTION public.find_or_create_contact(
  p_brand_id uuid,
  p_phone_normalized text,
  p_phone_raw text,
  p_country_code text DEFAULT 'IT',
  p_assumed_country boolean DEFAULT true,
  p_first_name text DEFAULT NULL,
  p_last_name text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_cap text DEFAULT NULL,
  p_lead_message text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contact_id uuid;
BEGIN
  -- Try to find existing contact by normalized phone in contact_phones table
  SELECT cp.contact_id INTO v_contact_id
  FROM public.contact_phones cp
  WHERE cp.brand_id = p_brand_id
    AND cp.phone_normalized = p_phone_normalized
    AND cp.is_active = true
  LIMIT 1;
  
  IF v_contact_id IS NOT NULL THEN
    -- Update existing contact with new data if provided (don't overwrite with nulls)
    UPDATE public.contacts
    SET
      first_name = COALESCE(NULLIF(p_first_name, ''), first_name),
      last_name = COALESCE(NULLIF(p_last_name, ''), last_name),
      email = COALESCE(NULLIF(p_email, ''), email),
      city = COALESCE(NULLIF(p_city, ''), city),
      cap = COALESCE(NULLIF(p_cap, ''), cap),
      lead_message = COALESCE(NULLIF(p_lead_message, ''), lead_message),
      updated_at = now()
    WHERE id = v_contact_id;
    
    RETURN v_contact_id;
  END IF;
  
  -- Create new contact
  INSERT INTO public.contacts (
    brand_id,
    first_name,
    last_name,
    email,
    city,
    cap,
    lead_message
  ) VALUES (
    p_brand_id,
    p_first_name,
    p_last_name,
    p_email,
    p_city,
    p_cap,
    p_lead_message
  )
  RETURNING id INTO v_contact_id;
  
  -- Create phone record in contact_phones table
  INSERT INTO public.contact_phones (
    brand_id,
    contact_id,
    phone_raw,
    phone_normalized,
    country_code,
    assumed_country,
    is_primary,
    is_active
  ) VALUES (
    p_brand_id,
    v_contact_id,
    p_phone_raw,
    p_phone_normalized,
    p_country_code,
    p_assumed_country,
    true,
    true
  );
  
  RETURN v_contact_id;
END;
$$;