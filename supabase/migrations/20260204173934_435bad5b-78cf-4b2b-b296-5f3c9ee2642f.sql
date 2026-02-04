-- Add callback_requested field to contacts table
ALTER TABLE public.contacts
ADD COLUMN callback_requested boolean NOT NULL DEFAULT false;

-- Add index for filtering contacts with callback requests
CREATE INDEX idx_contacts_callback_requested ON public.contacts(callback_requested) WHERE callback_requested = true;

-- Add comment for documentation
COMMENT ON COLUMN public.contacts.callback_requested IS 'Indicates if contact requested a callback (richiesta ricontatto)';