
DO $$
DECLARE
  r record;
  keep_public text[] := ARRAY[
    'consume_ip_rate_limit',
    'claim_idempotency_key',
    'complete_idempotency_key',
    'check_phone_duplicate',
    'consume_rate_limit_token',
    'consume_auth_rate_limit'
  ];
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND has_function_privilege('anon', p.oid, 'EXECUTE') = true
      AND p.proname <> ALL(keep_public)
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC',
      r.proname, r.args
    );
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon',
      r.proname, r.args
    );
  END LOOP;
END $$;
