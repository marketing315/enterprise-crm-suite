CREATE OR REPLACE FUNCTION public.find_or_create_contact(p_brand_id uuid, p_phone_normalized text, p_phone_raw text, p_country_code text, p_assumed_country boolean, p_first_name text DEFAULT NULL::text, p_last_name text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_cap text DEFAULT NULL::text, p_lead_message text DEFAULT NULL::text, p_address text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_contact_id uuid;
  v_lock_key bigint;
BEGIN
  -- Anti race-condition: serialize concurrent calls for the same (brand, phone)
  -- via a transaction-scoped advisory lock. Hash is stable across sessions.
  v_lock_key := hashtextextended(p_brand_id::text || '|' || COALESCE(p_phone_normalized, ''), 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

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
      address = COALESCE(NULLIF(p_address, ''), address),
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
    address,
    lead_message
  ) VALUES (
    p_brand_id,
    p_first_name,
    p_last_name,
    p_email,
    p_city,
    p_cap,
    p_address,
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
$function$;