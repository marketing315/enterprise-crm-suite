-- C5: replay guard table for internal mTLS-equivalent HMAC mutual auth
CREATE TABLE IF NOT EXISTS public.internal_auth_nonces (
  nonce text PRIMARY KEY,
  caller text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_internal_auth_nonces_expires
  ON public.internal_auth_nonces(expires_at);

ALTER TABLE public.internal_auth_nonces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "internal_auth_nonces_service_only" ON public.internal_auth_nonces;
CREATE POLICY "internal_auth_nonces_service_only"
  ON public.internal_auth_nonces
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Cleanup helper, idempotent
CREATE OR REPLACE FUNCTION public.cleanup_internal_auth_nonces()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.internal_auth_nonces WHERE expires_at < now();
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_internal_auth_nonces() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_internal_auth_nonces() TO service_role;