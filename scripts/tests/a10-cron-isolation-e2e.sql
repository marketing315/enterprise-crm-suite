-- A10 — Cron isolation E2E checks
-- Run: psql "$DATABASE_URL" -f scripts/tests/a10-cron-isolation-e2e.sql

\set ON_ERROR_STOP on
BEGIN;

-- 1) Registry e run_log esistono con RLS abilitata
SELECT
  (SELECT relrowsecurity FROM pg_class WHERE oid='public.cron_job_registry'::regclass) AS registry_rls,
  (SELECT relrowsecurity FROM pg_class WHERE oid='public.cron_run_log'::regclass) AS run_log_rls;

-- 2) Tutti i job cron sono registrati (no drift)
SELECT count(*) AS unregistered_jobs
FROM cron.job j
LEFT JOIN public.cron_job_registry r ON r.job_name = j.jobname
WHERE r.id IS NULL;
-- Atteso: 0

-- 3) Append-only: UPDATE diretto bloccato
DO $$
DECLARE v_id bigint;
BEGIN
  v_id := public.cron_log_start('a10-test', NULL, '{}'::jsonb);
  BEGIN
    UPDATE public.cron_run_log SET status='success' WHERE id = v_id;
    RAISE EXCEPTION 'EXPECTED FAILURE: direct UPDATE should have been blocked';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'OK: direct UPDATE blocked';
  END;
  BEGIN
    DELETE FROM public.cron_run_log WHERE id = v_id;
    RAISE EXCEPTION 'EXPECTED FAILURE: direct DELETE should have been blocked';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'OK: direct DELETE blocked';
  END;
  -- Ma cron_log_finish funziona
  PERFORM public.cron_log_finish(v_id, 'success', NULL);
END $$;

-- 4) REVOKE su funzioni di maintenance (anon/authenticated non possono invocare)
SELECT
  has_function_privilege('anon', 'public.cleanup_webhook_dedup()', 'EXECUTE') AS anon_cleanup_dedup,
  has_function_privilege('authenticated', 'public.cleanup_webhook_dedup()', 'EXECUTE') AS auth_cleanup_dedup,
  has_function_privilege('anon', 'public.cleanup_outbound_webhook_deliveries(integer)', 'EXECUTE') AS anon_cleanup_deliveries,
  has_function_privilege('authenticated', 'public.cleanup_outbound_webhook_deliveries(integer)', 'EXECUTE') AS auth_cleanup_deliveries;
-- Atteso: tutte false

-- 5) JWT redaction nel list_cron_jobs (samples manuale): verifica che il regex
--    rimuova "Bearer eyJ..." → "Bearer ***REDACTED***"
SELECT regexp_replace('Authorization: Bearer eyJhbGciOiJIUzI1NiI.payload.sig', 'Bearer\s+[A-Za-z0-9._\-]+', 'Bearer ***REDACTED***', 'gi')
  AS redacted_sample;

ROLLBACK;
