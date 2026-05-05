-- A1 RLS Sweep — close gap on webhook_request_dedup (RLS enabled, 0 policies)
-- Make service-role-only access explicit; authenticated/anon stay denied by RLS.

CREATE POLICY "webhook_request_dedup_service_only"
  ON public.webhook_request_dedup
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.webhook_request_dedup IS
  'Idempotency cache for webhook ingestion. Service-role only; no client access.';