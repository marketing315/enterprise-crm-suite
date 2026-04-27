REVOKE EXECUTE ON FUNCTION public.cleanup_webhook_dedup() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_webhook_dedup() TO service_role;
