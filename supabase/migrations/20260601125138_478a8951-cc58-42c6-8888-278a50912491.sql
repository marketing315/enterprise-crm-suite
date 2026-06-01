-- 1) Nuova tabella user_biometric_credentials
CREATE TABLE IF NOT EXISTS public.user_biometric_credentials (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  pin_hash text NOT NULL,
  pin_attempts int NOT NULL DEFAULT 0,
  locked_until timestamptz,
  label text,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  disabled_at timestamptz,
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_biometric_credentials_user
  ON public.user_biometric_credentials(user_id) WHERE disabled_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_biometric_credentials TO authenticated;
GRANT ALL ON public.user_biometric_credentials TO service_role;

ALTER TABLE public.user_biometric_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "biometric: users view own"
  ON public.user_biometric_credentials FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "biometric: users insert own"
  ON public.user_biometric_credentials FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "biometric: users update own"
  ON public.user_biometric_credentials FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "biometric: users delete own"
  ON public.user_biometric_credentials FOR DELETE
  USING (user_id = auth.uid());

-- 2) Colonna method su mfa_trusted_devices (additiva, default 'totp')
ALTER TABLE public.mfa_trusted_devices
  ADD COLUMN IF NOT EXISTS method text NOT NULL DEFAULT 'totp';

-- abilitiamo pgcrypto per bcrypt (gen_salt/crypt)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 3) RPC set_biometric_pin: upsert credenziale con PIN bcrypt
CREATE OR REPLACE FUNCTION public.set_biometric_pin(
  _pin_client_hash text,
  _label text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
  v_bcrypt text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _pin_client_hash IS NULL OR length(_pin_client_hash) < 32 THEN
    RAISE EXCEPTION 'invalid pin hash';
  END IF;

  v_bcrypt := crypt(_pin_client_hash, gen_salt('bf', 12));

  INSERT INTO public.user_biometric_credentials (
    user_id, pin_hash, label, pin_attempts, locked_until, disabled_at
  ) VALUES (
    v_uid, v_bcrypt, _label, 0, NULL, NULL
  )
  ON CONFLICT (user_id) DO UPDATE
    SET pin_hash = EXCLUDED.pin_hash,
        label = COALESCE(EXCLUDED.label, public.user_biometric_credentials.label),
        pin_attempts = 0,
        locked_until = NULL,
        disabled_at = NULL
  RETURNING id INTO v_id;

  PERFORM public.log_audit_event(
    'user_biometric_credentials',
    'biometric_pin_set',
    NULL, v_id, NULL, NULL,
    jsonb_build_object('label', _label)
  );

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_biometric_pin(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_biometric_pin(text, text) TO authenticated;

-- 4) RPC verify_biometric_pin: ritorna esito + applica lockout server-side
CREATE OR REPLACE FUNCTION public.verify_biometric_pin(_pin_client_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cred public.user_biometric_credentials%ROWTYPE;
  v_match boolean;
  v_lock_until timestamptz;
  v_wipe boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  SELECT * INTO v_cred FROM public.user_biometric_credentials
   WHERE user_id = v_uid AND disabled_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_enrolled');
  END IF;

  IF v_cred.locked_until IS NOT NULL AND v_cred.locked_until > now() THEN
    RETURN jsonb_build_object(
      'ok', false, 'reason', 'locked',
      'locked_until', v_cred.locked_until
    );
  END IF;

  v_match := (v_cred.pin_hash = crypt(COALESCE(_pin_client_hash, ''), v_cred.pin_hash));

  IF v_match THEN
    UPDATE public.user_biometric_credentials
       SET pin_attempts = 0,
           locked_until = NULL,
           last_used_at = now()
     WHERE id = v_cred.id;
    PERFORM public.log_audit_event(
      'user_biometric_credentials', 'biometric_unlock_ok',
      NULL, v_cred.id, NULL, NULL, '{}'::jsonb
    );
    RETURN jsonb_build_object('ok', true);
  END IF;

  -- Fallito: incremento e lockout
  IF v_cred.pin_attempts + 1 >= 10 THEN
    v_wipe := true;
    UPDATE public.user_biometric_credentials
       SET pin_attempts = 0,
           locked_until = NULL,
           disabled_at = now()
     WHERE id = v_cred.id;
  ELSIF v_cred.pin_attempts + 1 >= 5 THEN
    v_lock_until := now() + interval '15 minutes';
    UPDATE public.user_biometric_credentials
       SET pin_attempts = v_cred.pin_attempts + 1,
           locked_until = v_lock_until
     WHERE id = v_cred.id;
  ELSE
    UPDATE public.user_biometric_credentials
       SET pin_attempts = v_cred.pin_attempts + 1
     WHERE id = v_cred.id;
  END IF;

  PERFORM public.log_audit_event(
    'user_biometric_credentials',
    CASE WHEN v_wipe THEN 'biometric_wiped' ELSE 'biometric_unlock_fail' END,
    NULL, v_cred.id, NULL, NULL,
    jsonb_build_object('attempts', v_cred.pin_attempts + 1)
  );

  RETURN jsonb_build_object(
    'ok', false,
    'reason', CASE WHEN v_wipe THEN 'wiped' WHEN v_lock_until IS NOT NULL THEN 'locked' ELSE 'wrong_pin' END,
    'locked_until', v_lock_until,
    'remaining_attempts', GREATEST(0, 5 - (v_cred.pin_attempts + 1))
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.verify_biometric_pin(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_biometric_pin(text) TO authenticated;

-- 5) RPC disable_biometric: soft-disable
CREATE OR REPLACE FUNCTION public.disable_biometric()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  UPDATE public.user_biometric_credentials
     SET disabled_at = now(),
         pin_attempts = 0,
         locked_until = NULL
   WHERE user_id = v_uid AND disabled_at IS NULL;

  PERFORM public.log_audit_event(
    'user_biometric_credentials', 'biometric_disabled',
    NULL, v_uid, NULL, NULL, '{}'::jsonb
  );
  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.disable_biometric() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.disable_biometric() TO authenticated;

-- 6) RPC register_biometric_aal2_grant: trusted-device biometrico
CREATE OR REPLACE FUNCTION public.register_biometric_aal2_grant(
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
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _token_hash IS NULL OR length(_token_hash) < 32 THEN
    RAISE EXCEPTION 'invalid token hash';
  END IF;
  _days := GREATEST(1, LEAST(COALESCE(_days, 30), 90));

  INSERT INTO public.mfa_trusted_devices (
    user_id, token_hash, label, user_agent, expires_at, method
  ) VALUES (
    v_uid, _token_hash, _label, _user_agent, now() + make_interval(days => _days), 'biometric'
  )
  ON CONFLICT (user_id, token_hash) DO UPDATE
    SET expires_at = EXCLUDED.expires_at,
        last_used_at = now(),
        revoked_at = NULL,
        method = 'biometric',
        label = COALESCE(EXCLUDED.label, public.mfa_trusted_devices.label),
        user_agent = COALESCE(EXCLUDED.user_agent, public.mfa_trusted_devices.user_agent)
  RETURNING id INTO v_id;

  PERFORM public.log_audit_event(
    'mfa_trusted_devices', 'biometric_aal2_grant',
    NULL, v_id, NULL, NULL,
    jsonb_build_object('days', _days)
  );
  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.register_biometric_aal2_grant(text, text, text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_biometric_aal2_grant(text, text, text, int) TO authenticated;

-- 7) RPC check_biometric_aal2: valida grant biometrico
CREATE OR REPLACE FUNCTION public.check_biometric_aal2(_token_hash text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ok boolean := false;
BEGIN
  IF v_uid IS NULL OR _token_hash IS NULL THEN RETURN false; END IF;

  UPDATE public.mfa_trusted_devices
     SET last_used_at = now()
   WHERE user_id = v_uid
     AND token_hash = _token_hash
     AND method = 'biometric'
     AND revoked_at IS NULL
     AND expires_at > now()
  RETURNING true INTO v_ok;

  RETURN COALESCE(v_ok, false);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_biometric_aal2(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_biometric_aal2(text) TO authenticated;

-- 8) RPC get_biometric_status: stato corrente per la UI
CREATE OR REPLACE FUNCTION public.get_biometric_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cred public.user_biometric_credentials%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('enrolled', false);
  END IF;
  SELECT * INTO v_cred FROM public.user_biometric_credentials
   WHERE user_id = v_uid AND disabled_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('enrolled', false);
  END IF;
  RETURN jsonb_build_object(
    'enrolled', true,
    'label', v_cred.label,
    'last_used_at', v_cred.last_used_at,
    'created_at', v_cred.created_at,
    'locked_until', v_cred.locked_until
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_biometric_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_biometric_status() TO authenticated;