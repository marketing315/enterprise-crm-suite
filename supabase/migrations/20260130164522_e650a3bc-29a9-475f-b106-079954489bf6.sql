-- Add plain-text HMAC secret column (encrypted at rest by Supabase)
-- This is needed because HMAC verification requires the original secret to compute the expected signature
ALTER TABLE public.webhook_sources 
ADD COLUMN IF NOT EXISTS hmac_secret text;

-- Add comment explaining the security model
COMMENT ON COLUMN public.webhook_sources.hmac_secret IS 'Plain-text HMAC secret for signature verification. Encrypted at rest. Only used when hmac_enabled=true.';