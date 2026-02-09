-- Fix SECURITY DEFINER view issue: recreate as SECURITY INVOKER
DROP VIEW IF EXISTS public.webhook_sources_safe;

CREATE VIEW public.webhook_sources_safe
WITH (security_invoker = true) AS
SELECT 
  id, brand_id, name, description, is_active,
  rate_limit_per_min, hmac_enabled, replay_window_seconds,
  created_at, updated_at
FROM public.webhook_sources;

GRANT SELECT ON public.webhook_sources_safe TO authenticated;