ALTER TABLE public.webhook_sources ADD COLUMN IF NOT EXISTS handler text DEFAULT NULL;

UPDATE public.webhook_sources SET handler = 'keplero' WHERE id = 'f330ec9e-368b-4478-9ac3-a93c57ad9893';

COMMENT ON COLUMN public.webhook_sources.handler IS 'Optional handler for routing to specialized edge functions (e.g. keplero). NULL = standard processing.';