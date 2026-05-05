-- A4-bis: Unified audit view (audit_log legacy + audit_events new)
-- Additive only. Keeps audit_log readable while consumers migrate.

CREATE OR REPLACE VIEW public.audit_log_unified
WITH (security_invoker = true)
AS
SELECT
  ae.id,
  ae.brand_id,
  ae.entity_type,
  ae.entity_id,
  ae.action,
  ae.actor_user_id,
  ae.old_value,
  ae.new_value,
  ae.metadata,
  ae.occurred_at AS created_at,
  'audit_events'::text AS source_table
FROM public.audit_events ae
UNION ALL
SELECT
  al.id,
  al.brand_id,
  al.entity_type,
  al.entity_id,
  al.action,
  al.actor_user_id,
  al.old_value,
  al.new_value,
  al.metadata,
  al.created_at,
  'audit_log'::text AS source_table
FROM public.audit_log al;

COMMENT ON VIEW public.audit_log_unified IS
  'A4-bis: unified read view over legacy audit_log + new audit_events. security_invoker=true so existing RLS on base tables applies. Writers MUST use public.log_audit_event() going forward.';

GRANT SELECT ON public.audit_log_unified TO authenticated;