-- Add missing phone_normalized column to contacts table
ALTER TABLE public.contacts 
ADD COLUMN IF NOT EXISTS phone_normalized TEXT;

-- Add index for deduplication lookups
CREATE INDEX IF NOT EXISTS idx_contacts_phone_normalized_brand 
ON public.contacts(phone_normalized, brand_id);

-- Add phone column if missing
ALTER TABLE public.contacts 
ADD COLUMN IF NOT EXISTS phone TEXT;