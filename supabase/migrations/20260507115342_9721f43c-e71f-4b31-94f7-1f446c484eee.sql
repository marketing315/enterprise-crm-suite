CREATE SCHEMA IF NOT EXISTS import_storico;

CREATE TABLE IF NOT EXISTS import_storico.contacts_raw (
  src_id text,
  first_name text, last_name text, email text,
  phone_norm text, country_code text, assumed_country boolean,
  city text, cap text, province text, country text, address text,
  company_name text, vat_number text, fiscal_code text,
  lead_message text, lead_extra text, lead_type text, lead_reason text,
  provenance text, created_at timestamptz
);

CREATE TABLE IF NOT EXISTS import_storico.phones_raw (
  src_id text, phone_raw text, phone_norm text,
  country_code text, assumed_country boolean, is_primary boolean
);

CREATE INDEX IF NOT EXISTS idx_storico_contacts_phone ON import_storico.contacts_raw(phone_norm);