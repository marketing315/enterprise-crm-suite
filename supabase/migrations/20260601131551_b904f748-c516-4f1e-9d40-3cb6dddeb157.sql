-- set_biometric_pin: audit best-effort
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

  -- Audit best-effort: la biometria è per-utente (no brand), se l'audit_events
  -- richiede brand_id NOT NULL non vogliamo bloccare l'attivazione.
  BEGIN
    PERFORM public.log_audit_event(
      'user_biometric_credentials',
      'biometric_pin_set',
      NULL, v_id, NULL, NULL,
      jsonb_build_object('label', _label)
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'audit log skipped for biometric_pin_set: %', SQLERRM;
  END;

  RETURN v_id;
END;
$function$;