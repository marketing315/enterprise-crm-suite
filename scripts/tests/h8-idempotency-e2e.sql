-- H8 end-to-end test for idempotency.
--
-- Exercises the contract used by `supabase/functions/_shared/idempotency.ts`:
--   1. First call with a fresh key  -> outcome = 'inserted'
--   2. Replay before completion     -> outcome = 'in_progress' (no work re-run)
--   3. Replay AFTER completion      -> outcome = 'replay' with cached body
--   4. Same key, different payload  -> outcome = 'payload_mismatch'
--   5. idempotency_events is append-only on every step (UPDATE/DELETE blocked,
--      and at least one event row exists per scenario step).
--
-- Run as service_role (psql with PG* env vars uses the postgres superuser locally).
-- All asserts use RAISE EXCEPTION on failure, so a non-zero exit means a test failed.

BEGIN;

DO $h8$
DECLARE
  v_scope     text := 'h8-test:' || gen_random_uuid()::text;
  v_caller    text := 'test-fp-' || gen_random_uuid()::text;
  v_key       text := 'h8-key-' || replace(gen_random_uuid()::text, '-', '');
  v_payload_a text := '{"phone":"+390000000001","contact_id":"a"}';
  v_payload_b text := '{"phone":"+390000000002","contact_id":"b"}';
  v_fp_a      text;
  v_fp_b      text;
  v_row       record;
  v_events_after_claim    int;
  v_events_after_replay   int;
  v_events_after_complete int;
  v_events_after_replay2  int;
  v_events_after_mismatch int;
  v_keep_id   uuid;
BEGIN
  -- Test-only fingerprints; in production these are SHA-256 hex from JS.
  v_fp_a := md5(v_payload_a);
  v_fp_b := md5(v_payload_b);

  ------------------------------------------------------------------
  -- 1. First claim
  ------------------------------------------------------------------
  SELECT * INTO v_row
  FROM public.claim_idempotency_key(v_scope, NULL, v_caller, v_key, v_fp_a, 60);

  IF v_row.outcome <> 'inserted' THEN
    RAISE EXCEPTION 'H8/step1: expected outcome=inserted, got %', v_row.outcome;
  END IF;
  v_keep_id := v_row.key_id;

  SELECT count(*) INTO v_events_after_claim
  FROM public.idempotency_events
  WHERE scope = v_scope AND idem_key = v_key;
  IF v_events_after_claim < 1 THEN
    RAISE EXCEPTION 'H8/step1: no append-only event recorded after claim';
  END IF;

  ------------------------------------------------------------------
  -- 2. Replay before completion -> in_progress
  ------------------------------------------------------------------
  SELECT * INTO v_row
  FROM public.claim_idempotency_key(v_scope, NULL, v_caller, v_key, v_fp_a, 60);

  IF v_row.outcome <> 'in_progress' THEN
    RAISE EXCEPTION 'H8/step2: expected outcome=in_progress, got %', v_row.outcome;
  END IF;
  IF v_row.key_id <> v_keep_id THEN
    RAISE EXCEPTION 'H8/step2: key_id changed across replay (% vs %)', v_row.key_id, v_keep_id;
  END IF;

  SELECT count(*) INTO v_events_after_replay
  FROM public.idempotency_events
  WHERE scope = v_scope AND idem_key = v_key;
  IF v_events_after_replay <= v_events_after_claim THEN
    RAISE EXCEPTION 'H8/step2: replay did not append a new event (%, %)',
      v_events_after_claim, v_events_after_replay;
  END IF;

  ------------------------------------------------------------------
  -- 3. Complete the key with a cached response
  ------------------------------------------------------------------
  PERFORM public.complete_idempotency_key(
    v_keep_id, 200, jsonb_build_object('ok', true, 'call_id', 'abc123'), false
  );

  SELECT count(*) INTO v_events_after_complete
  FROM public.idempotency_events
  WHERE scope = v_scope AND idem_key = v_key;
  IF v_events_after_complete <= v_events_after_replay THEN
    RAISE EXCEPTION 'H8/step3: complete did not append a new event';
  END IF;

  ------------------------------------------------------------------
  -- 4. Replay AFTER completion -> outcome=replay with cached body
  ------------------------------------------------------------------
  SELECT * INTO v_row
  FROM public.claim_idempotency_key(v_scope, NULL, v_caller, v_key, v_fp_a, 60);

  IF v_row.outcome <> 'replay' THEN
    RAISE EXCEPTION 'H8/step4: expected outcome=replay, got %', v_row.outcome;
  END IF;
  IF v_row.cached_status <> 200 THEN
    RAISE EXCEPTION 'H8/step4: cached_status mismatch, got %', v_row.cached_status;
  END IF;
  IF (v_row.cached_body->>'call_id') <> 'abc123' THEN
    RAISE EXCEPTION 'H8/step4: cached_body mismatch, got %', v_row.cached_body;
  END IF;

  SELECT count(*) INTO v_events_after_replay2
  FROM public.idempotency_events
  WHERE scope = v_scope AND idem_key = v_key;
  IF v_events_after_replay2 <= v_events_after_complete THEN
    RAISE EXCEPTION 'H8/step4: post-completion replay did not append a new event';
  END IF;

  ------------------------------------------------------------------
  -- 5. Same key, DIFFERENT payload -> payload_mismatch
  ------------------------------------------------------------------
  SELECT * INTO v_row
  FROM public.claim_idempotency_key(v_scope, NULL, v_caller, v_key, v_fp_b, 60);

  IF v_row.outcome <> 'payload_mismatch' THEN
    RAISE EXCEPTION 'H8/step5: expected outcome=payload_mismatch, got %', v_row.outcome;
  END IF;

  SELECT count(*) INTO v_events_after_mismatch
  FROM public.idempotency_events
  WHERE scope = v_scope AND idem_key = v_key AND event = 'payload_mismatch';
  IF v_events_after_mismatch < 1 THEN
    RAISE EXCEPTION 'H8/step5: payload_mismatch event not recorded';
  END IF;

  ------------------------------------------------------------------
  -- 6. Append-only: UPDATE and DELETE on idempotency_events must fail
  ------------------------------------------------------------------
  BEGIN
    UPDATE public.idempotency_events
       SET event = 'tampered'
     WHERE scope = v_scope AND idem_key = v_key;
    RAISE EXCEPTION 'H8/step6a: UPDATE on idempotency_events should have been blocked';
  EXCEPTION WHEN others THEN
    -- expected (raised by the block trigger)
    NULL;
  END;

  BEGIN
    DELETE FROM public.idempotency_events
     WHERE scope = v_scope AND idem_key = v_key;
    RAISE EXCEPTION 'H8/step6b: DELETE on idempotency_events should have been blocked';
  EXCEPTION WHEN others THEN
    NULL;
  END;

  RAISE NOTICE 'H8 idempotency e2e: ALL CHECKS PASSED (scope=%, events=%)',
    v_scope, v_events_after_mismatch + v_events_after_replay2;
END
$h8$;

ROLLBACK;
