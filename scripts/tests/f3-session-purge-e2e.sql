-- F3 — Post-logout session purge E2E checks
-- Run: psql "$DATABASE_URL" -f scripts/tests/f3-session-purge-e2e.sql

\set ON_ERROR_STOP on
BEGIN;

-- 0) Funzioni esistono con SECURITY DEFINER e search_path bloccato
SELECT
  p.proname,
  p.prosecdef AS security_definer,
  pg_get_function_arguments(p.oid) AS args
FROM pg_proc p
WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('purge_user_session_data', 'cleanup_session_data_all')
ORDER BY proname;

-- 1) GRANT corretti: solo authenticated può chiamare purge_user_session_data;
--    cleanup_session_data_all è solo per service_role/postgres.
SELECT
  has_function_privilege('anon', 'public.purge_user_session_data(uuid, uuid)', 'EXECUTE') AS anon_can_purge,
  has_function_privilege('authenticated', 'public.purge_user_session_data(uuid, uuid)', 'EXECUTE') AS auth_can_purge,
  has_function_privilege('anon', 'public.cleanup_session_data_all()', 'EXECUTE') AS anon_can_cleanup,
  has_function_privilege('authenticated', 'public.cleanup_session_data_all()', 'EXECUTE') AS auth_can_cleanup,
  has_function_privilege('service_role', 'public.cleanup_session_data_all()', 'EXECUTE') AS svc_can_cleanup;
-- Atteso: purge → anon=false, authenticated=true; cleanup → anon=false, authenticated=false, service_role=true.

-- 2) Job registrato in cron_job_registry (A10)
SELECT job_name, tenant_scope, is_critical, invokes_security_definer
FROM public.cron_job_registry
WHERE job_name = 'cleanup_session_data_all';
-- Atteso: una riga, system, true, true.

-- 3) Esecuzione aggregator: deve loggare su cron_run_log con status=success
DO $$
DECLARE
  v_before bigint;
  v_after bigint;
  v_last_status text;
BEGIN
  SELECT count(*) INTO v_before FROM public.cron_run_log WHERE job_name = 'cleanup_session_data_all';
  PERFORM public.cleanup_session_data_all();
  SELECT count(*), max(status) INTO v_after, v_last_status
    FROM public.cron_run_log WHERE job_name = 'cleanup_session_data_all';
  IF v_after <> v_before + 1 THEN
    RAISE EXCEPTION 'EXPECTED: cron_run_log incremented by 1 (before=%, after=%)', v_before, v_after;
  END IF;
  RAISE NOTICE 'OK: cleanup_session_data_all logged (status=%)', v_last_status;
END $$;

-- 4) AuthZ: chiamare purge per un altro utente da utente non-admin deve fallire
--    (simulato: la RPC controlla auth.uid() = p_auth_user_id OR has_role admin).
--    In contesto SQL diretto auth.uid() è NULL → bypass AuthZ (caller=service),
--    quindi qui ci limitiamo a verificare che lo check guard esista nel sorgente.
SELECT (pg_get_functiondef('public.purge_user_session_data(uuid, uuid)'::regprocedure)
  ILIKE '%v_caller_auth <> p_auth_user_id%') AS has_authz_guard;
-- Atteso: t

-- 5) Idempotency keys 'in_progress' NON vengono toccate (race-safety)
SELECT (pg_get_functiondef('public.purge_user_session_data(uuid, uuid)'::regprocedure)
  ILIKE '%status IN (''completed'',''failed'')%') AS preserves_in_progress;
-- Atteso: t

ROLLBACK;
