-- C2: Webhook Idempotency Hardening — E2E SQL test
-- Verifies INSERT-first claim semantics for keplero-webhook (and any scope using
-- _shared/idempotency.ts). Run inside transaction so it never pollutes prod data.
--
-- Usage:
--   psql -f scripts/tests/c2-webhook-idempotency-e2e.sql

BEGIN;

DO $$
DECLARE
  scope_name TEXT := 't_c2_keplero_' || extract(epoch from now())::bigint::text;
  fp TEXT := 'fp_' || md5(random()::text);
  payload TEXT := '{"a":1}';
  payload_alt TEXT := '{"a":2}';
  r RECORD;
BEGIN
  -- 1) First claim → "inserted"
  SELECT * INTO r FROM public.claim_idempotency_key(
    scope_name, NULL, '127.0.0.1', 'kep_' || fp, encode(extensions.digest(payload, 'sha256'), 'hex'), 3600
  );
  ASSERT r.outcome = 'inserted', format('expected inserted, got %s', r.outcome);
  RAISE NOTICE 'OK 1/5 first claim → inserted (key_id=%)', r.key_id;

  -- 2) Second claim same key, same payload → "in_progress"
  SELECT * INTO r FROM public.claim_idempotency_key(
    scope_name, NULL, '127.0.0.1', 'kep_' || fp, encode(extensions.digest(payload, 'sha256'), 'hex'), 3600
  );
  ASSERT r.outcome = 'in_progress', format('expected in_progress, got %s', r.outcome);
  RAISE NOTICE 'OK 2/5 concurrent claim → in_progress';

  -- 3) Different payload, same key → "payload_mismatch"
  SELECT * INTO r FROM public.claim_idempotency_key(
    scope_name, NULL, '127.0.0.1', 'kep_' || fp, encode(extensions.digest(payload_alt, 'sha256'), 'hex'), 3600
  );
  ASSERT r.outcome = 'payload_mismatch', format('expected payload_mismatch, got %s', r.outcome);
  RAISE NOTICE 'OK 3/5 mismatched payload → payload_mismatch';

  -- 4) Complete the original key
  PERFORM public.complete_idempotency_key(
    (SELECT id FROM public.idempotency_keys WHERE scope=scope_name AND idem_key='kep_'||fp),
    200, '{"success":true,"replay":"test"}'::jsonb, false
  );

  -- 5) After completion, replay returns cached body
  SELECT * INTO r FROM public.claim_idempotency_key(
    scope_name, NULL, '127.0.0.1', 'kep_' || fp, encode(extensions.digest(payload, 'sha256'), 'hex'), 3600
  );
  ASSERT r.outcome = 'replay', format('expected replay, got %s', r.outcome);
  ASSERT r.cached_status = 200, 'cached status mismatch';
  ASSERT r.cached_body->>'success' = 'true', 'cached body mismatch';
  RAISE NOTICE 'OK 4/5 post-complete claim → replay (status=%, body=%)', r.cached_status, r.cached_body;

  -- 6) Append-only: idempotency_events row exists for the claim sequence
  ASSERT (SELECT count(*) FROM public.idempotency_events
          WHERE key_id = (SELECT id FROM public.idempotency_keys WHERE scope=scope_name AND idem_key='kep_'||fp)) >= 1,
    'expected at least one idempotency_events row';
  RAISE NOTICE 'OK 5/5 events recorded';

  RAISE NOTICE '=== C2 E2E PASSED for scope=% ===', scope_name;
END $$;

ROLLBACK;
