-- 1. Estendi user_biometric_credentials con i campi necessari al login server WebAuthn
ALTER TABLE public.user_biometric_credentials
  ADD COLUMN IF NOT EXISTS credential_id BYTEA,
  ADD COLUMN IF NOT EXISTS public_key BYTEA,
  ADD COLUMN IF NOT EXISTS public_key_alg INTEGER,
  ADD COLUMN IF NOT EXISTS sign_count BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS aaguid UUID,
  ADD COLUMN IF NOT EXISTS transports TEXT[];

-- Indice unico parziale: ogni credential_id può esistere una sola volta (quando presente)
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_biometric_credentials_credential_id
  ON public.user_biometric_credentials (credential_id)
  WHERE credential_id IS NOT NULL;

-- 2. Tabella challenge per il flusso WebAuthn discoverable
CREATE TABLE IF NOT EXISTS public.passkey_auth_challenges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  challenge_b64 TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  consumed_at TIMESTAMPTZ,
  client_ip TEXT
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.passkey_auth_challenges TO service_role;

ALTER TABLE public.passkey_auth_challenges ENABLE ROW LEVEL SECURITY;

-- Nessuna policy per anon/authenticated → tabella accessibile solo via service_role (edge functions)

CREATE INDEX IF NOT EXISTS idx_passkey_auth_challenges_created
  ON public.passkey_auth_challenges (created_at DESC);

-- Cleanup automatico challenge vecchie (>1h) tramite funzione + cron eventuale
CREATE OR REPLACE FUNCTION public.cleanup_passkey_auth_challenges()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.passkey_auth_challenges
   WHERE created_at < now() - INTERVAL '1 hour';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cleanup_passkey_auth_challenges() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_passkey_auth_challenges() TO service_role;