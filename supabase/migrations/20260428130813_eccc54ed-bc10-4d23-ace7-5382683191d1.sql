-- Espone payload_schema nella view safe per consentire all'editor UI di leggere lo schema corrente
DROP VIEW IF EXISTS public.webhook_sources_safe;

CREATE VIEW public.webhook_sources_safe
WITH (security_invoker = true) AS
SELECT 
  id, brand_id, name, description, is_active, rate_limit_per_min,
  hmac_enabled, replay_window_seconds, counts_as_new_lead, 
  default_pipeline_stage_id, payload_schema,
  created_at, updated_at
FROM public.webhook_sources;

GRANT SELECT ON public.webhook_sources_safe TO authenticated;