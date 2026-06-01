-- Fix: pgcrypto vive in schema `extensions` ma le funzioni biometriche
-- avevano search_path='public', quindi crypt()/gen_salt() non venivano risolte
-- e l'attivazione falliva con "function crypt does not exist".

CREATE OR REPLACE FUNCTION public.set_biometric_pin(_pin_client_hash text, _label text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
  v_bcrypt text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _pin_client_hash IS NULL OR length(_pin_client_hash) < 32 THEN
    RAISE EXCEPTION 'invalid pin hash';
  END IF;

  v_bcrypt := extensions.crypt(_pin_client_hash, extensions.gen_salt('bf', 12));

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
$function$;

-- Stessa correzione su verify_biometric_pin: usiamo extensions.crypt esplicitamente.
CREATE OR REPLACE FUNCTION public.verify_biometric_pin(_pin_client_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.user_biometric_credentials%ROWTYPE;
  v_ok boolean;
  v_remaining int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _pin_client_hash IS NULL OR length(_pin_client_hash) < 32 THEN
    RAISE EXCEPTION 'invalid pin hash';
  END IF;

  SELECT * INTO v_row FROM public.user_biometric_credentials WHERE user_id = v_uid;
  IF NOT FOUND OR v_row.disabled_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_enrolled');
  END IF;

  IF v_row.locked_until IS NOT NULL AND v_row.locked_until > now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'locked', 'locked_until', v_row.locked_until);
  END IF;

  v_ok := extensions.crypt(_pin_client_hash, v_row.pin_hash) = v_row.pin_hash;

  IF v_ok THEN
    UPDATE public.user_biometric_credentials
       SET pin_attempts = 0, locked_until = NULL, last_used_at = now()
     WHERE id = v_row.id;
    RETURN jsonb_build_object('ok', true);
  END IF;

  -- Fallito: incrementa contatori e applica lockout/wipe
  UPDATE public.user_biometric_credentials
     SET pin_attempts = pin_attempts + 1,
         locked_until = CASE
           WHEN pin_attempts + 1 >= 10 THEN now() + interval '1 day'
           WHEN pin_attempts + 1 >= 5  THEN now() + interval '15 minutes'
           ELSE locked_until
         END,
         disabled_at = CASE
           WHEN pin_attempts + 1 >= 10 THEN now()
           ELSE disabled_at
         END
   WHERE id = v_row.id
  RETURNING (10 - pin_attempts) INTO v_remaining;

  IF v_row.pin_attempts + 1 >= 10 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'wiped');
  END IF;
  IF v_row.pin_attempts + 1 >= 5 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'locked', 'locked_until', now() + interval '15 minutes');
  END IF;
  RETURN jsonb_build_object('ok', false, 'reason', 'bad_pin', 'remaining_attempts', GREATEST(v_remaining, 0));
END;
$function$;