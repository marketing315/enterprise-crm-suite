-- 1. Move pg_trgm extension from public to extensions schema
CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION pg_trgm SET SCHEMA extensions;

-- 2. Fix search_path on functions that are missing it

ALTER FUNCTION public.create_outbound_webhook(
  p_brand_id uuid, p_name text, p_url text, p_secret text,
  p_event_types text[], p_is_active boolean, p_payload_format text,
  p_payload_mapping jsonb, p_custom_url_params jsonb
) SET search_path = public;

ALTER FUNCTION public.list_outbound_webhooks(p_brand_id uuid)
  SET search_path = public;

ALTER FUNCTION public.update_outbound_webhook(
  p_id uuid, p_name text, p_url text, p_event_types text[],
  p_is_active boolean, p_payload_format text,
  p_payload_mapping jsonb, p_custom_url_params jsonb
) SET search_path = public;

ALTER FUNCTION public.update_contact_tracking_updated_at()
  SET search_path = public;