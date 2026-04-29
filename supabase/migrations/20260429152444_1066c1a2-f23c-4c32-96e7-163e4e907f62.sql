-- =============================================================
-- SECURITY HARDENING P1 — Revoke EXECUTE FROM anon
-- =============================================================
-- Strategia:
-- 1. REVOKE EXECUTE FROM anon, PUBLIC su tutte le RPC SECURITY DEFINER public
-- 2. GRANT EXECUTE TO authenticated, service_role (mantiene funzionamento)
-- 3. Re-GRANT esplicito a anon per le RPC pubbliche legittime (webhook lookup)
--
-- Edge function pattern:
-- - Webhook (Meta, Keplero, Voispeed) → usano service_role → OK
-- - Frontend chiama RPC con JWT → role authenticated → OK
-- - anon = utenti non loggati → bloccato (corretto)

DO $$
DECLARE
  fn RECORD;
BEGIN
  FOR fn IN
    SELECT 
      p.oid,
      p.proname,
      pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    -- Revoke da anon e PUBLIC (default grant)
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon, PUBLIC',
      fn.proname, fn.args
    );
    -- Garantisce che authenticated e service_role mantengano accesso
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role',
      fn.proname, fn.args
    );
  END LOOP;
END $$;

-- ----- Whitelist: RPC che DEVONO restare pubbliche -----
-- Queste sono chiamate da contesti unauth legittimi (webhook lookup, rate limit pre-auth)

-- consume_rate_limit_token: chiamata da webhook-ingest prima dell'auth check
GRANT EXECUTE ON FUNCTION public.consume_rate_limit_token(uuid) TO anon;

-- check_phone_duplicate: usata da Keplero lookup pre-auth (302 redirect pattern)
-- (mem://technical/keplero-contact-lookup-service)
GRANT EXECUTE ON FUNCTION public.check_phone_duplicate(uuid, text) TO anon;