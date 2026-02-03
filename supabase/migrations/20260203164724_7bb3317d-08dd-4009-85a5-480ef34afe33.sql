
-- Fix: Aggiungi 'address' al contact_snapshot per webhook outbound
CREATE OR REPLACE FUNCTION public.build_contact_snapshot(p_contact_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'id', c.id,
    'first_name', c.first_name,
    'last_name', c.last_name,
    'email', c.email,
    'address', c.address,
    'city', c.city,
    'cap', c.cap,
    'status', c.status,
    'primary_phone', (
      SELECT cp.phone_normalized 
      FROM contact_phones cp 
      WHERE cp.contact_id = c.id AND cp.is_primary = true 
      LIMIT 1
    )
  )
  INTO v_result
  FROM contacts c
  WHERE c.id = p_contact_id;
  
  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;
