-- =========================================================================
-- A9 — UNIQUE/CHECK sweep (additive, non-blocking)
-- =========================================================================

-- 1) Disable the legacy bad row first so it does not pollute the new unique
UPDATE public.contact_phones
   SET is_active = false
 WHERE id = 'bd36516f-e4c4-4195-96f4-e2e61f8e0ef8'
   AND phone_normalized = '3';

-- 2) Partial unique on contacts(brand_id, phone_normalized) — only when both set
CREATE UNIQUE INDEX IF NOT EXISTS ux_contacts_brand_phone_normalized
  ON public.contacts (brand_id, phone_normalized)
  WHERE phone_normalized IS NOT NULL AND phone_normalized <> '';

-- 3) NOT VALID format checks (only new rows are validated; legacy data preserved)
ALTER TABLE public.contact_phones
  ADD CONSTRAINT contact_phones_normalized_format_chk
  CHECK (
    phone_normalized IS NULL
    OR (length(phone_normalized) >= 8 AND phone_normalized ~ '^[0-9]+$')
  ) NOT VALID;

ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_phone_normalized_format_chk
  CHECK (
    phone_normalized IS NULL
    OR phone_normalized = ''
    OR (length(phone_normalized) >= 8 AND phone_normalized ~ '^[0-9]+$')
  ) NOT VALID;

COMMENT ON CONSTRAINT contact_phones_normalized_format_chk ON public.contact_phones IS
  'A9: enforces digits-only ≥8 chars on new/updated rows. Legacy rows pre-2026-05-05 not validated.';
COMMENT ON CONSTRAINT contacts_phone_normalized_format_chk ON public.contacts IS
  'A9: enforces digits-only ≥8 chars on new/updated rows. Legacy rows pre-2026-05-05 not validated.';
COMMENT ON INDEX public.ux_contacts_brand_phone_normalized IS
  'A9: prevents duplicate normalized phone numbers within a brand on the contacts table.';