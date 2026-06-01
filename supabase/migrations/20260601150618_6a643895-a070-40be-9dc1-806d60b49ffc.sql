-- Tabella dedicata per le passkey multi-dispositivo, separata da user_biometric_credentials
-- (che resta il record canonico per PIN + vault biometrico locale).
CREATE TABLE IF NOT EXISTS public.user_passkeys (
  id              UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID NOT NULL,
  credential_id   BYTEA NOT NULL,
  public_key      BYTEA NOT NULL,
  public_key_alg  INTEGER NOT NULL,
  sign_count      BIGINT NOT NULL DEFAULT 0,
  aaguid          UUID,
  transports      TEXT[],
  label           TEXT,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at    TIMESTAMPTZ,
  disabled_at     TIMESTAMPTZ,
  CONSTRAINT user_passkeys_credential_id_unique UNIQUE (credential_id)
);

CREATE INDEX IF NOT EXISTS idx_user_passkeys_user_active
  ON public.user_passkeys (user_id)
  WHERE disabled_at IS NULL;

-- GRANT: ogni policy filtra per auth.uid(), niente anon.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_passkeys TO authenticated;
GRANT ALL ON public.user_passkeys TO service_role;

ALTER TABLE public.user_passkeys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "passkeys: users view own"
  ON public.user_passkeys FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "passkeys: users insert own"
  ON public.user_passkeys FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "passkeys: users update own"
  ON public.user_passkeys FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "passkeys: users delete own"
  ON public.user_passkeys FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Service-role bypassa RLS by-design; nessuna policy esplicita necessaria.

-- RPC helper per la UI: lista le passkey attive dell'utente loggato.
CREATE OR REPLACE FUNCTION public.list_my_passkeys()
RETURNS TABLE (
  id UUID,
  label TEXT,
  user_agent TEXT,
  aaguid UUID,
  transports TEXT[],
  created_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, label, user_agent, aaguid, transports, created_at, last_used_at
    FROM public.user_passkeys
   WHERE user_id = auth.uid()
     AND disabled_at IS NULL
   ORDER BY created_at DESC
   LIMIT 50;
$$;

REVOKE EXECUTE ON FUNCTION public.list_my_passkeys() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_passkeys() TO authenticated;

-- RPC per rinominare una passkey (UI inline edit)
CREATE OR REPLACE FUNCTION public.rename_my_passkey(_id UUID, _label TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF _label IS NULL OR length(trim(_label)) = 0 OR length(_label) > 80 THEN
    RAISE EXCEPTION 'invalid label';
  END IF;
  UPDATE public.user_passkeys
     SET label = trim(_label)
   WHERE id = _id AND user_id = v_uid AND disabled_at IS NULL;
  RETURN FOUND;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rename_my_passkey(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rename_my_passkey(UUID, TEXT) TO authenticated;

-- RPC per revocare (soft-delete) una passkey
CREATE OR REPLACE FUNCTION public.revoke_my_passkey(_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  UPDATE public.user_passkeys
     SET disabled_at = now()
   WHERE id = _id AND user_id = v_uid AND disabled_at IS NULL;

  BEGIN
    PERFORM public.log_audit_event(
      'user_passkeys', 'passkey_revoked',
      NULL, _id, NULL, NULL, '{}'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN
    -- audit best-effort
    NULL;
  END;

  RETURN FOUND;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.revoke_my_passkey(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_my_passkey(UUID) TO authenticated;