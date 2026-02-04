-- Set default marketing_consent to true for all new contacts
ALTER TABLE public.contacts 
ALTER COLUMN marketing_consent SET DEFAULT true;

-- Update existing contacts without consent to have consent enabled
UPDATE public.contacts 
SET marketing_consent = true 
WHERE marketing_consent = false OR marketing_consent IS NULL;