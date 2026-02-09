-- Fix: Remove SELECT policy that exposes sensitive columns (hmac_secret, api_key_hash, hmac_secret_hash)
-- Admins retain full access via the existing ALL policy

DROP POLICY "Users can view webhook sources" ON public.webhook_sources;

-- Create a safe view excluding sensitive columns
CREATE OR REPLACE VIEW public.webhook_sources_safe AS
SELECT 
  id, brand_id, name, description, is_active,
  rate_limit_per_min, hmac_enabled, replay_window_seconds,
  created_at, updated_at
FROM public.webhook_sources;

-- Grant authenticated users access to the safe view
GRANT SELECT ON public.webhook_sources_safe TO authenticated;

-- Add a restricted SELECT policy: only admins can SELECT directly from the base table
-- (they already have the ALL policy, but let's be explicit)
CREATE POLICY "Only admins can select webhook sources directly"
  ON public.webhook_sources FOR SELECT
  USING (has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role));