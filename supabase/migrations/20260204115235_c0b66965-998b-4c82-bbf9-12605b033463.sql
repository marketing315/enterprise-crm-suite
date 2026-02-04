-- Update find_or_create_contact to accept lead_message parameter
-- First drop any existing overloads to avoid ambiguity
DO $$
BEGIN
  -- Drop all existing overloads of find_or_create_contact
  DROP FUNCTION IF EXISTS public.find_or_create_contact(uuid, text, text, text, boolean, text, text, text, text, text);
  DROP FUNCTION IF EXISTS public.find_or_create_contact(uuid, text, text, text, boolean, text, text, text, text, text, text);
EXCEPTION WHEN undefined_function THEN
  NULL;
END $$;

-- Recreate with all parameters including lead_message
CREATE OR REPLACE FUNCTION public.find_or_create_contact(
  p_brand_id uuid,
  p_phone_normalized text,
  p_phone_raw text,
  p_country_code text,
  p_assumed_country boolean,
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
  -- Try to find existing contact by normalized phone
  SELECT id INTO v_contact_id
  FROM public.contacts
  WHERE brand_id = p_brand_id
    AND phone_normalized = p_phone_normalized
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
    phone_normalized,
    phone_raw,
    phone_country_code,
    phone_country_assumed,
    first_name,
    last_name,
    email,
    city,
    cap,
    lead_message
  ) VALUES (
    p_brand_id,
    p_phone_normalized,
    p_phone_raw,
    p_country_code,
    p_assumed_country,
    p_first_name,
    p_last_name,
    p_email,
    p_city,
    p_cap,
    p_lead_message
  )
  RETURNING id INTO v_contact_id;
  
  RETURN v_contact_id;
END;
$$;