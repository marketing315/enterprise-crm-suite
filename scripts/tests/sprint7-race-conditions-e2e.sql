-- Sprint 7 E2E SQL: race condition guards for move_deal_stage & assign_ticket
-- Run with: psql $DATABASE_URL -f scripts/tests/sprint7-race-conditions-e2e.sql
-- Expected: every RAISE NOTICE 'PASS:' line printed; any failure aborts the transaction.

BEGIN;

DO $$
DECLARE
  v_brand uuid;
  v_contact uuid;
  v_stage_a uuid;
  v_stage_b uuid;
  v_deal uuid;
  v_version int;
  v_ticket uuid;
  v_user uuid;
  v_caught text;
BEGIN
  -- pick existing brand / contact / two stages
  SELECT id INTO v_brand FROM brands WHERE id <> '00000000-0000-0000-0000-000000000000' LIMIT 1;
  SELECT id INTO v_contact FROM contacts WHERE brand_id = v_brand AND archived_at IS NULL LIMIT 1;
  SELECT id INTO v_stage_a FROM pipeline_stages WHERE brand_id = v_brand ORDER BY position LIMIT 1;
  SELECT id INTO v_stage_b FROM pipeline_stages WHERE brand_id = v_brand AND id <> v_stage_a ORDER BY position LIMIT 1;

  IF v_brand IS NULL OR v_contact IS NULL OR v_stage_a IS NULL OR v_stage_b IS NULL THEN
    RAISE EXCEPTION 'SKIP: insufficient fixtures (brand/contact/stages)';
  END IF;

  -- Insert a deal
  INSERT INTO deals (brand_id, contact_id, current_stage_id, status, title)
  VALUES (v_brand, v_contact, v_stage_a, 'open', 'sprint7-test')
  RETURNING id, version INTO v_deal, v_version;

  RAISE NOTICE 'PASS: deal seeded id=% version=%', v_deal, v_version;

  -- 1) Stale version → STALE_DEAL
  BEGIN
    PERFORM move_deal_stage(v_deal, v_stage_b, v_version + 99);
    RAISE EXCEPTION 'FAIL: move_deal_stage accepted stale version';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught LIKE '%STALE_DEAL%' THEN
      RAISE NOTICE 'PASS: STALE_DEAL raised on stale version';
    ELSE
      RAISE EXCEPTION 'FAIL: expected STALE_DEAL, got %', v_caught;
    END IF;
  END;

  -- 2) Correct version → success + bump
  PERFORM move_deal_stage(v_deal, v_stage_b, v_version);
  IF (SELECT current_stage_id FROM deals WHERE id = v_deal) = v_stage_b THEN
    RAISE NOTICE 'PASS: deal moved to stage_b';
  ELSE
    RAISE EXCEPTION 'FAIL: deal not moved';
  END IF;

  -- 3) assign_ticket stale guard
  SELECT id INTO v_ticket FROM tickets WHERE brand_id = v_brand AND archived_at IS NULL LIMIT 1;
  SELECT id INTO v_user FROM users LIMIT 1;
  IF v_ticket IS NOT NULL AND v_user IS NOT NULL THEN
    BEGIN
      PERFORM assign_ticket(v_ticket, v_user, 99999);
      RAISE EXCEPTION 'FAIL: assign_ticket accepted stale version';
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
      IF v_caught LIKE '%STALE_TICKET%' THEN
        RAISE NOTICE 'PASS: STALE_TICKET raised on stale version';
      ELSE
        RAISE EXCEPTION 'FAIL: expected STALE_TICKET, got %', v_caught;
      END IF;
    END;
  ELSE
    RAISE NOTICE 'SKIP: no ticket fixture available';
  END IF;
END $$;

ROLLBACK;
