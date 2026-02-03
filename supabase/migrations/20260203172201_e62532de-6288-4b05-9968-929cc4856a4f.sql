-- =========================
-- CONTACTS: campi SiLeads
-- =========================
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS lead_valid boolean,
  ADD COLUMN IF NOT EXISTS fax text,
  ADD COLUMN IF NOT EXISTS vat_number text,
  ADD COLUMN IF NOT EXISTS fiscal_code text,
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS province text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS company_address text,
  ADD COLUMN IF NOT EXISTS company_city text,
  ADD COLUMN IF NOT EXISTS company_province text,
  ADD COLUMN IF NOT EXISTS company_zip text,
  ADD COLUMN IF NOT EXISTS lead_extra text,
  ADD COLUMN IF NOT EXISTS lead_reason_id text,
  ADD COLUMN IF NOT EXISTS lead_type text,
  ADD COLUMN IF NOT EXISTS lead_message text,
  ADD COLUMN IF NOT EXISTS lead_reason text,
  ADD COLUMN IF NOT EXISTS lead_cost numeric(12,2),
  ADD COLUMN IF NOT EXISTS lead_note text,
  ADD COLUMN IF NOT EXISTS lead_state_id text,
  ADD COLUMN IF NOT EXISTS lead_validation_ts timestamptz,
  ADD COLUMN IF NOT EXISTS note1 text,
  ADD COLUMN IF NOT EXISTS note2 text,
  ADD COLUMN IF NOT EXISTS note3 text,
  ADD COLUMN IF NOT EXISTS note4 text,
  ADD COLUMN IF NOT EXISTS note5 text,
  ADD COLUMN IF NOT EXISTS note6 text,
  ADD COLUMN IF NOT EXISTS note7 text,
  ADD COLUMN IF NOT EXISTS note8 text,
  ADD COLUMN IF NOT EXISTS note9 text,
  ADD COLUMN IF NOT EXISTS note10 text;

-- Indici utili
CREATE INDEX IF NOT EXISTS idx_contacts_vat_number ON public.contacts (vat_number);
CREATE INDEX IF NOT EXISTS idx_contacts_fiscal_code ON public.contacts (fiscal_code);
CREATE INDEX IF NOT EXISTS idx_contacts_company_name ON public.contacts (company_name);
CREATE INDEX IF NOT EXISTS idx_contacts_lead_state_id ON public.contacts (lead_state_id);

-- Aggiorna build_contact_snapshot per includere tutti i nuovi campi
CREATE OR REPLACE FUNCTION public.build_contact_snapshot(p_contact_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = 'public'
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
    )
  )
  INTO v_result
  FROM contacts c
  WHERE c.id = p_contact_id;
  
  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;