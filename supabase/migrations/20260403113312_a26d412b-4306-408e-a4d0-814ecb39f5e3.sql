
CREATE OR REPLACE FUNCTION public.build_contact_snapshot(p_contact_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
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
    'province', c.province,
    'country', c.country,
    'status', c.status,
    'notes', c.notes,
    'lead_valid', c.lead_valid,
    'fax', c.fax,
    'vat_number', c.vat_number,
    'fiscal_code', c.fiscal_code,
    'company_name', c.company_name,
    'company_address', c.company_address,
    'company_city', c.company_city,
    'company_province', c.company_province,
    'company_zip', c.company_zip,
    'lead_extra', c.lead_extra,
    'lead_reason_id', c.lead_reason_id,
    'lead_type', c.lead_type,
    'lead_message', c.lead_message,
    'lead_reason', c.lead_reason,
    'lead_cost', c.lead_cost,
    'lead_note', c.lead_note,
    'lead_state_id', c.lead_state_id,
    'lead_validation_ts', c.lead_validation_ts,
    'note1', c.note1,
    'note2', c.note2,
    'note3', c.note3,
    'note4', c.note4,
    'note5', c.note5,
    'note6', c.note6,
    'note7', c.note7,
    'note8', c.note8,
    'note9', c.note9,
    'note10', c.note10,
    'primary_phone', (
      SELECT cp.phone_normalized
      FROM contact_phones cp
      WHERE cp.contact_id = c.id AND cp.is_primary = true
      LIMIT 1
    ),
    'pipeline_stage_name', (
      SELECT ps.name
      FROM deals d
      JOIN pipeline_stages ps ON ps.id = d.current_stage_id
      WHERE d.contact_id = c.id AND d.status = 'open'
      ORDER BY d.created_at DESC
      LIMIT 1
    )
  )
  INTO v_result
  FROM contacts c
  WHERE c.id = p_contact_id;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;
