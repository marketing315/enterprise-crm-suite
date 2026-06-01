-- =========================================================
-- 1. Estensione user_biometric_credentials (additiva)
-- =========================================================
ALTER TABLE public.user_biometric_credentials
  ADD COLUMN IF NOT EXISTS is_synced boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS backup_eligible boolean,
  ADD COLUMN IF NOT EXISTS backup_state boolean,
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz;

-- =========================================================
-- 2. Tabella pin_login_challenges
-- =========================================================
CREATE TABLE IF NOT EXISTS public.pin_login_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  auth_user_id uuid,                         -- nullable: anche se l'email non esiste creiamo la challenge per non rivelarlo
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '5 minutes'),
  consumed_at timestamptz,
  verified_at timestamptz,                   -- impostato solo dopo verify_pin_login OK
  session_token_hash text,                   -- hash del token one-shot che l'edge function riscatta
  session_token_expires_at timestamptz,
  ip_address text,
  user_agent text,
  attempts smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pin_login_challenges_user_active
  ON public.pin_login_challenges(auth_user_id, expires_at)
  WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pin_login_challenges_expires
  ON public.pin_login_challenges(expires_at);

-- GRANTS: tabella usata solo da SECURITY DEFINER + service_role
GRANT ALL ON public.pin_login_challenges TO service_role;

ALTER TABLE public.pin_login_challenges ENABLE ROW LEVEL SECURITY;

-- Nessuna policy per anon/authenticated: accesso solo via RPC SECURITY DEFINER + service_role.

-- =========================================================
-- 3. RPC start_pin_login(email) — restituisce sempre challenge_id
-- =========================================================
CREATE OR REPLACE FUNCTION public.start_pin_login(
  _email text,
  _ip text DEFAULT NULL,
  _user_agent text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id uuid;
  v_challenge_id uuid;
  v_email_norm text;
BEGIN
  v_email_norm := lower(trim(coalesce(_email, '')));

  IF v_email_norm = '' OR v_email_norm !~ '^[^@]+@[^@]+\.[^@]+$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_email');
  END IF;

  -- Trova l'auth.users.id; se non esiste manteniamo NULL (non riveliamo nulla)
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(email) = v_email_norm
  LIMIT 1;

  INSERT INTO public.pin_login_challenges (email, auth_user_id, ip_address, user_agent)
  VALUES (v_email_norm, v_user_id, _ip, _user_agent)
  RETURNING id INTO v_challenge_id;

  -- Cleanup opportunistico delle vecchie challenge scadute
  DELETE FROM public.pin_login_challenges
  WHERE expires_at < now() - interval '1 hour';

  RETURN jsonb_build_object(
    'ok', true,
    'challenge_id', v_challenge_id,
    'expires_in', 300
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.start_pin_login(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_pin_login(text, text, text) TO anon, authenticated, service_role;

-- =========================================================
-- 4. RPC verify_pin_login(challenge_id, pin_hash)
-- =========================================================
CREATE OR REPLACE FUNCTION public.verify_pin_login(
  _challenge_id uuid,
  _pin_client_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_ch public.pin_login_challenges%ROWTYPE;
  v_cred public.user_biometric_credentials%ROWTYPE;
  v_token text;
  v_token_hash text;
  v_remaining smallint;
  v_lock_until timestamptz;
BEGIN
  -- Lock pessimistico sulla challenge
  SELECT * INTO v_ch
  FROM public.pin_login_challenges
  WHERE id = _challenge_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_challenge');
  END IF;

  IF v_ch.consumed_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_consumed');
  END IF;

  IF v_ch.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;

  IF v_ch.attempts >= 5 THEN
    UPDATE public.pin_login_challenges
      SET consumed_at = now()
    WHERE id = _challenge_id;
    RETURN jsonb_build_object('ok', false, 'reason', 'too_many_attempts');
  END IF;

  UPDATE public.pin_login_challenges
    SET attempts = attempts + 1
  WHERE id = _challenge_id;

  -- Se l'email non esisteva, fingiamo PIN errato (no user enumeration)
  IF v_ch.auth_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_pin');
  END IF;

  -- Recupera la credenziale biometrica attiva
  SELECT * INTO v_cred
  FROM public.user_biometric_credentials
  WHERE user_id = v_ch.auth_user_id
    AND is_active = true
  LIMIT 1;

  IF NOT FOUND OR v_cred.pin_hash IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_pin');
  END IF;

  -- Lockout user-level
  IF v_cred.pin_locked_until IS NOT NULL AND v_cred.pin_locked_until > now() THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'locked',
      'locked_until', v_cred.pin_locked_until
    );
  END IF;

  -- Confronto PIN (bcrypt)
  IF v_cred.pin_hash = extensions.crypt(_pin_client_hash, v_cred.pin_hash) THEN
    -- PIN OK → reset attempts + emit token one-shot
    v_token := encode(extensions.gen_random_bytes(32), 'hex');
    v_token_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

    UPDATE public.user_biometric_credentials
      SET pin_attempts = 0,
          pin_locked_until = NULL,
          last_used_at = now()
    WHERE id = v_cred.id;

    UPDATE public.pin_login_challenges
      SET consumed_at = now(),
          verified_at = now(),
          session_token_hash = v_token_hash,
          session_token_expires_at = now() + interval '60 seconds'
    WHERE id = _challenge_id;

    -- Audit best-effort
    BEGIN
      PERFORM public.log_audit_event(
        'auth_event',
        'pin_login_verified',
        jsonb_build_object(
          'auth_user_id', v_ch.auth_user_id,
          'challenge_id', _challenge_id,
          'ip', v_ch.ip_address
        )
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    RETURN jsonb_build_object(
      'ok', true,
      'session_token', v_token,
      'auth_user_id', v_ch.auth_user_id
    );
  ELSE
    -- PIN errato → bump attempts + lockout
    UPDATE public.user_biometric_credentials
      SET pin_attempts = coalesce(pin_attempts, 0) + 1,
          pin_locked_until = CASE
            WHEN coalesce(pin_attempts, 0) + 1 >= 5 THEN now() + interval '15 minutes'
            ELSE pin_locked_until
          END
      WHERE id = v_cred.id
      RETURNING pin_attempts, pin_locked_until INTO v_remaining, v_lock_until;

    -- Wipe a 10 tentativi totali
    IF v_remaining >= 10 THEN
      UPDATE public.user_biometric_credentials
        SET is_active = false,
            pin_hash = NULL,
            pin_attempts = 0,
            pin_locked_until = NULL
      WHERE id = v_cred.id;

      BEGIN
        PERFORM public.log_audit_event(
          'auth_event',
          'pin_login_wiped',
          jsonb_build_object('auth_user_id', v_ch.auth_user_id)
        );
      EXCEPTION WHEN OTHERS THEN NULL;
      END;

      RETURN jsonb_build_object('ok', false, 'reason', 'wiped');
    END IF;

    RETURN jsonb_build_object(
      'ok', false,
      'reason', CASE WHEN v_lock_until IS NOT NULL AND v_lock_until > now() THEN 'locked' ELSE 'invalid_pin' END,
      'remaining_attempts', greatest(0, 5 - v_remaining),
      'locked_until', v_lock_until
    );
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.verify_pin_login(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_pin_login(uuid, text) TO anon, authenticated, service_role;

-- =========================================================
-- 5. RPC riscatto token (service_role only)
--    Verifica il token one-shot e restituisce email + user_id da usare per
--    creare la sessione Supabase via admin API nell'edge function.
-- =========================================================
CREATE OR REPLACE FUNCTION public.consume_pin_login_token(_session_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash text;
  v_ch public.pin_login_challenges%ROWTYPE;
  v_email text;
BEGIN
  IF _session_token IS NULL OR length(_session_token) < 32 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_token');
  END IF;

  v_hash := encode(extensions.digest(_session_token, 'sha256'), 'hex');

  SELECT * INTO v_ch
  FROM public.pin_login_challenges
  WHERE session_token_hash = v_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_token');
  END IF;

  IF v_ch.session_token_expires_at IS NULL OR v_ch.session_token_expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;

  IF v_ch.verified_at IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_verified');
  END IF;

  -- Consuma il token (single-use)
  UPDATE public.pin_login_challenges
    SET session_token_hash = NULL,
        session_token_expires_at = NULL
  WHERE id = v_ch.id;

  SELECT email INTO v_email FROM auth.users WHERE id = v_ch.auth_user_id LIMIT 1;

  RETURN jsonb_build_object(
    'ok', true,
    'auth_user_id', v_ch.auth_user_id,
    'email', v_email
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.consume_pin_login_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_pin_login_token(text) TO service_role;