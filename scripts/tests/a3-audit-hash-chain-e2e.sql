-- A3 E2E: audit immutability + hash chain
-- Verifica:
--   1) UPDATE su audit_events bloccato (42501)
--   2) DELETE su audit_events bloccato (42501)
--   3) Nuovo INSERT genera chain_seq monotonico e row_hash linkato
--   4) Tampering simulato (via DISABLE trigger) viene rilevato da verify_audit_chain
--   5) Catena attuale verifica 0 issues
-- Tutto in BEGIN/ROLLBACK.

BEGIN;

DO $$
DECLARE
  v_max_before bigint;
  v_max_after bigint;
  v_issues bigint;
BEGIN
  SELECT max(chain_seq) INTO v_max_before FROM audit_events;

  -- 1) UPDATE blocked
  BEGIN
    UPDATE audit_events SET action='TAMPERED' WHERE chain_seq=v_max_before;
    RAISE EXCEPTION 'TEST 1 FAILED: UPDATE should be blocked';
  EXCEPTION WHEN sqlstate '42501' THEN
    RAISE NOTICE 'TEST 1 OK: UPDATE blocked';
  END;

  -- 2) DELETE blocked
  BEGIN
    DELETE FROM audit_events WHERE chain_seq=v_max_before;
    RAISE EXCEPTION 'TEST 2 FAILED: DELETE should be blocked';
  EXCEPTION WHEN sqlstate '42501' THEN
    RAISE NOTICE 'TEST 2 OK: DELETE blocked';
  END;

  -- 3) INSERT auto-chain
  INSERT INTO audit_events (brand_id, entity_type, entity_id, action, actor_type, source, metadata)
  VALUES ('00000000-0000-0000-0000-000000000000','a3_test',gen_random_uuid(),'A3_E2E','system','test','{}'::jsonb);

  SELECT max(chain_seq) INTO v_max_after FROM audit_events;
  IF v_max_after > v_max_before THEN
    RAISE NOTICE 'TEST 3 OK: chain_seq advanced %->%', v_max_before, v_max_after;
  ELSE
    RAISE EXCEPTION 'TEST 3 FAILED: expected > % got %', v_max_before, v_max_after;
  END IF;

  -- 5) full chain verifies clean
  SELECT count(*) INTO v_issues FROM verify_audit_chain();
  IF v_issues = 0 THEN
    RAISE NOTICE 'TEST 5 OK: chain verified clean (0 issues across % events)', v_max_after;
  ELSE
    RAISE EXCEPTION 'TEST 5 FAILED: % integrity issues found', v_issues;
  END IF;

  -- 4) Simula tampering bypassando i trigger immutabilità
  ALTER TABLE audit_events DISABLE TRIGGER audit_events_no_update;
  UPDATE audit_events SET action = action || '_X' WHERE chain_seq = v_max_after;
  ALTER TABLE audit_events ENABLE TRIGGER audit_events_no_update;

  SELECT count(*) INTO v_issues
  FROM verify_audit_chain(v_max_after, v_max_after)
  WHERE issue = 'row_hash_mismatch';

  IF v_issues >= 1 THEN
    RAISE NOTICE 'TEST 4 OK: tampering detected (row_hash_mismatch)';
  ELSE
    RAISE EXCEPTION 'TEST 4 FAILED: tampering NOT detected';
  END IF;

  RAISE NOTICE '====== A3 E2E: ALL TESTS PASSED ======';
END$$;

ROLLBACK;
