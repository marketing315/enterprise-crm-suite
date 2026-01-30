-- Function to correct a contact's phone number with full audit trail
-- Handles: normalization, unique constraints, primary flag transfer, merge detection
CREATE OR REPLACE FUNCTION correct_contact_phone(
  p_contact_id uuid,
  p_old_phone text,
  p_new_phone text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_brand_id uuid;
  v_phone_record contact_phones%ROWTYPE;
  v_old_normalized text;
  v_new_normalized text;
  v_new_country_code text := 'IT';
  v_new_assumed_country boolean := true;
  v_existing_phone contact_phones%ROWTYPE;
  v_result jsonb;
BEGIN
  -- Get user id
  v_user_id := get_user_id(auth.uid());
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get brand from contact and validate access
  SELECT brand_id INTO v_brand_id
  FROM contacts
  WHERE id = p_contact_id;

  IF v_brand_id IS NULL THEN
    RAISE EXCEPTION 'Contact not found';
  END IF;

  IF NOT user_belongs_to_brand(v_user_id, v_brand_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Normalize phones (digits only)
  v_old_normalized := regexp_replace(p_old_phone, '\D', '', 'g');
  v_new_normalized := regexp_replace(p_new_phone, '\D', '', 'g');

  -- Detect country code from new phone
  IF length(v_new_normalized) > 10 THEN
    IF v_new_normalized LIKE '39%' THEN
      v_new_normalized := substring(v_new_normalized FROM 3);
      v_new_country_code := 'IT';
      v_new_assumed_country := false;
    ELSIF v_new_normalized LIKE '44%' THEN
      v_new_normalized := substring(v_new_normalized FROM 3);
      v_new_country_code := 'GB';
      v_new_assumed_country := false;
    ELSIF v_new_normalized LIKE '49%' THEN
      v_new_normalized := substring(v_new_normalized FROM 3);
      v_new_country_code := 'DE';
      v_new_assumed_country := false;
    ELSIF v_new_normalized LIKE '33%' THEN
      v_new_normalized := substring(v_new_normalized FROM 3);
      v_new_country_code := 'FR';
      v_new_assumed_country := false;
    ELSIF v_new_normalized LIKE '1%' AND length(v_new_normalized) = 11 THEN
      v_new_normalized := substring(v_new_normalized FROM 2);
      v_new_country_code := 'US';
      v_new_assumed_country := false;
    END IF;
  END IF;

  -- Find the phone record to update
  SELECT * INTO v_phone_record
  FROM contact_phones
  WHERE contact_id = p_contact_id
    AND brand_id = v_brand_id
    AND phone_normalized = v_old_normalized
  FOR UPDATE;

  IF v_phone_record.id IS NULL THEN
    RAISE EXCEPTION 'Phone number % not found for this contact', p_old_phone;
  END IF;

  -- Check if new phone already exists for another contact in same brand
  SELECT * INTO v_existing_phone
  FROM contact_phones
  WHERE brand_id = v_brand_id
    AND phone_normalized = v_new_normalized
    AND contact_id != p_contact_id;

  IF v_existing_phone.id IS NOT NULL THEN
    -- Phone exists on another contact - return conflict info for merge decision
    v_result := jsonb_build_object(
      'success', false,
      'error', 'phone_exists_other_contact',
      'conflicting_contact_id', v_existing_phone.contact_id,
      'message', 'Il numero ' || p_new_phone || ' è già associato ad un altro contatto'
    );
    RETURN v_result;
  END IF;

  -- Check if new phone already exists for THIS contact (same brand, same contact)
  SELECT * INTO v_existing_phone
  FROM contact_phones
  WHERE brand_id = v_brand_id
    AND phone_normalized = v_new_normalized
    AND contact_id = p_contact_id
    AND id != v_phone_record.id;

  IF v_existing_phone.id IS NOT NULL THEN
    -- New phone already exists on same contact - just deactivate old one
    UPDATE contact_phones
    SET is_active = false
    WHERE id = v_phone_record.id;

    -- If old was primary, transfer to existing
    IF v_phone_record.is_primary THEN
      UPDATE contact_phones
      SET is_primary = true
      WHERE id = v_existing_phone.id;
    END IF;

    -- Audit log
    INSERT INTO audit_log (brand_id, entity_type, entity_id, action, actor_user_id, old_value, new_value, metadata)
    VALUES (
      v_brand_id,
      'contact_phone',
      v_phone_record.id,
      'phone_corrected_merged',
      v_user_id,
      jsonb_build_object('phone_raw', v_phone_record.phone_raw, 'phone_normalized', v_phone_record.phone_normalized),
      jsonb_build_object('phone_raw', p_new_phone, 'phone_normalized', v_new_normalized, 'merged_with', v_existing_phone.id),
      jsonb_build_object('contact_id', p_contact_id, 'was_primary', v_phone_record.is_primary)
    );

    v_result := jsonb_build_object(
      'success', true,
      'action', 'merged',
      'phone_id', v_existing_phone.id,
      'message', 'Numero corretto e unito con record esistente'
    );
    RETURN v_result;
  END IF;

  -- Standard case: update the phone record
  UPDATE contact_phones
  SET 
    phone_raw = p_new_phone,
    phone_normalized = v_new_normalized,
    country_code = v_new_country_code,
    assumed_country = v_new_assumed_country
  WHERE id = v_phone_record.id;

  -- Audit log
  INSERT INTO audit_log (brand_id, entity_type, entity_id, action, actor_user_id, old_value, new_value, metadata)
  VALUES (
    v_brand_id,
    'contact_phone',
    v_phone_record.id,
    'phone_corrected',
    v_user_id,
    jsonb_build_object(
      'phone_raw', v_phone_record.phone_raw, 
      'phone_normalized', v_phone_record.phone_normalized,
      'country_code', v_phone_record.country_code
    ),
    jsonb_build_object(
      'phone_raw', p_new_phone, 
      'phone_normalized', v_new_normalized,
      'country_code', v_new_country_code
    ),
    jsonb_build_object('contact_id', p_contact_id, 'is_primary', v_phone_record.is_primary)
  );

  v_result := jsonb_build_object(
    'success', true,
    'action', 'updated',
    'phone_id', v_phone_record.id,
    'old_normalized', v_phone_record.phone_normalized,
    'new_normalized', v_new_normalized,
    'message', 'Numero corretto con successo'
  );

  RETURN v_result;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION correct_contact_phone(uuid, text, text) TO authenticated;