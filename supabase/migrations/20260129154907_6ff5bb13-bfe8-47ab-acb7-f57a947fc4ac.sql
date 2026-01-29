-- Fix SECURITY DEFINER view warning by recreating as regular view
-- Views in PostgreSQL don't have SECURITY DEFINER by default, 
-- but the linter may flag it. We'll add explicit security_invoker option.
DROP VIEW IF EXISTS public.outbound_webhooks_safe;

CREATE VIEW public.outbound_webhooks_safe 
WITH (security_invoker = true)
AS
SELECT 
  id,
  brand_id,
  name,
  url,
  is_active,
  event_types,
  created_at,
  updated_at
FROM public.outbound_webhooks;

-- Grant SELECT to authenticated users - they'll be governed by their own RLS
GRANT SELECT ON public.outbound_webhooks_safe TO authenticated;