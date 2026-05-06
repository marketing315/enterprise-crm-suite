
ALTER VIEW public.outbound_webhook_dlq SET (security_invoker = true);
ALTER VIEW public.sheets_export_dlq SET (security_invoker = true);
ALTER VIEW public.lead_digest_dlq SET (security_invoker = true);
ALTER VIEW public.notification_webhook_dlq SET (security_invoker = true);

REVOKE ALL ON public.outbound_webhook_dlq FROM PUBLIC, anon;
REVOKE ALL ON public.sheets_export_dlq FROM PUBLIC, anon;
REVOKE ALL ON public.lead_digest_dlq FROM PUBLIC, anon;
REVOKE ALL ON public.notification_webhook_dlq FROM PUBLIC, anon;

GRANT SELECT ON public.outbound_webhook_dlq TO authenticated;
GRANT SELECT ON public.sheets_export_dlq TO authenticated;
GRANT SELECT ON public.lead_digest_dlq TO authenticated;
GRANT SELECT ON public.notification_webhook_dlq TO authenticated;
