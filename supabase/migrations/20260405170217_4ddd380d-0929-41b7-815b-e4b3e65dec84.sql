-- Drop the OLD overload of find_or_create_contact (without p_address)
-- that causes ambiguity with the new version.
-- The old signature has DEFAULT on p_country_code and p_assumed_country;
-- the new one (with p_address) does NOT default those two.
DROP FUNCTION IF EXISTS public.find_or_create_contact(
  uuid, text, text,
  text,     -- p_country_code DEFAULT 'IT'
  boolean,  -- p_assumed_country DEFAULT true
  text, text, text, text, text, text
);