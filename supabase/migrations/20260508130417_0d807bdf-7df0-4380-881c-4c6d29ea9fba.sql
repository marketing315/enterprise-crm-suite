
CREATE TABLE IF NOT EXISTS public.mfa_trusted_devices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  token_hash text NOT NULL,
  label text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  UNIQUE (user_id, token_hash)
);

CREATE INDEX IF NOT EXISTS idx_mfa_trusted_devices_user
  ON public.mfa_trusted_devices(user_id) WHERE revoked_at IS NULL;

ALTER TABLE public.mfa_trusted_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can view own trusted devices"
  ON public.mfa_trusted_devices FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "users can revoke own trusted devices"
  ON public.mfa_trusted_devices FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "users can delete own trusted devices"
  ON public.mfa_trusted_devices FOR DELETE
  USING (user_id = auth.uid());

-- Registrazione: chiamata dopo MFA verify success
CREATE OR REPLACE FUNCTION public.register_mfa_trusted_device(
  _token_hash text,
  _label text DEFAULT NULL,
  _user_agent text DEFAULT NULL,
  _days int DEFAULT 30
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF _token_hash IS NULL OR length(_token_hash) < 32 THEN
    RAISE EXCEPTION 'invalid token hash';
  END IF;
  _days := GREATEST(1, LEAST(COALESCE(_days, 30), 90));

  INSERT INTO public.mfa_trusted_devices (
    user_id, token_hash, label, user_agent, expires_at
  ) VALUES (
    v_uid, _token_hash, _label, _user_agent, now() + make_interval(days => _days)
  )
  ON CONFLICT (user_id, token_hash) DO UPDATE
    SET expires_at = EXCLUDED.expires_at,
        last_used_at = now(),
        revoked_at = NULL,
        label = COALESCE(EXCLUDED.label, public.mfa_trusted_devices.label),
        user_agent = COALESCE(EXCLUDED.user_agent, public.mfa_trusted_devices.user_agent)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Verifica: chiamata dal client prima del prompt MFA
CREATE OR REPLACE FUNCTION public.check_mfa_trusted_device(_token_hash text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ok boolean := false;
BEGIN
  IF v_uid IS NULL OR _token_hash IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.mfa_trusted_devices
     SET last_used_at = now()
   WHERE user_id = v_uid
     AND token_hash = _token_hash
     AND revoked_at IS NULL
     AND expires_at > now()
  RETURNING true INTO v_ok;

  RETURN COALESCE(v_ok, false);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.register_mfa_trusted_device(text, text, text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_mfa_trusted_device(text, text, text, int) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.check_mfa_trusted_device(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_mfa_trusted_device(text) TO authenticated;
