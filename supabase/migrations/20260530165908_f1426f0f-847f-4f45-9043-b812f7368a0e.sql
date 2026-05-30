-- Revoke column-level read access to sensitive secrets and PII from authenticated/anon roles.
-- Only service_role (Edge Functions) may read these columns. Writes (INSERT/UPDATE) are unaffected.

-- ===== API tokens & app secrets =====
REVOKE SELECT (access_token, app_secret, verify_token) ON public.meta_apps FROM authenticated;
REVOKE SELECT (access_token, app_secret, verify_token) ON public.meta_apps FROM anon;

REVOKE SELECT (token) ON public.voispeed_configs FROM authenticated;
REVOKE SELECT (token) ON public.voispeed_configs FROM anon;

REVOKE SELECT (access_token) ON public.meta_lead_sources FROM authenticated;
REVOKE SELECT (access_token) ON public.meta_lead_sources FROM anon;

-- ===== HMAC / webhook signing secrets =====
REVOKE SELECT (hmac_secret) ON public.notification_webhook_destinations FROM authenticated;
REVOKE SELECT (hmac_secret) ON public.notification_webhook_destinations FROM anon;

REVOKE SELECT (hmac_secret) ON public.siem_destinations FROM authenticated;
REVOKE SELECT (hmac_secret) ON public.siem_destinations FROM anon;

REVOKE SELECT (hmac_secret) ON public.webhook_sources FROM authenticated;
REVOKE SELECT (hmac_secret) ON public.webhook_sources FROM anon;

REVOKE SELECT (webhook_secret) ON public.audit_alert_channels FROM authenticated;
REVOKE SELECT (webhook_secret) ON public.audit_alert_channels FROM anon;

-- ===== IP addresses & raw payloads =====
REVOKE SELECT (client_ip) ON public.contact_tracking FROM authenticated;
REVOKE SELECT (client_ip) ON public.contact_tracking FROM anon;

REVOKE SELECT (ip_address, raw_body) ON public.incoming_requests FROM authenticated;
REVOKE SELECT (ip_address, raw_body) ON public.incoming_requests FROM anon;

REVOKE SELECT (ip_address) ON public.session_audit FROM authenticated;
REVOKE SELECT (ip_address) ON public.session_audit FROM anon;