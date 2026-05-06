-- C6: AI quota enforcement — E2E SQL test
-- Verifies consume_ai_quota with system sentinel user + per-endpoint isolation.
--
-- Usage: psql -f scripts/tests/c6-ai-quota-e2e.sql

BEGIN;

DO $$
DECLARE
  sys_user UUID := '00000000-0000-0000-0000-000000000000';
  test_brand UUID := gen_random_uuid();
  ep TEXT := 't_c6_ai_classify_' || extract(epoch from now())::bigint::text;
  r JSONB;
BEGIN
  -- 1) prima call: consente
  r := public.consume_ai_quota(sys_user, test_brand, ep, 100, 3);
  ASSERT (r->>'allowed')::bool = true, format('expected allowed=true, got %s', r);
  ASSERT (r->>'used')::int = 1, format('expected used=1, got %s', r);
  RAISE NOTICE 'OK 1/4 first call → allowed (remaining=%)', r->>'remaining';

  -- 2) seconda + terza: consente
  PERFORM public.consume_ai_quota(sys_user, test_brand, ep, 50, 3);
  r := public.consume_ai_quota(sys_user, test_brand, ep, 50, 3);
  ASSERT (r->>'used')::int = 3, format('expected used=3, got %s', r);
  RAISE NOTICE 'OK 2/4 third call exhausts limit (used=%)', r->>'used';

  -- 3) quarta: nega + rollback contatori
  r := public.consume_ai_quota(sys_user, test_brand, ep, 999, 3);
  ASSERT (r->>'allowed')::bool = false, format('expected denied, got %s', r);
  RAISE NOTICE 'OK 3/4 quota exceeded → 429';

  -- 4) verifica rollback: total_input_chars NON deve includere il tentativo bloccato
  ASSERT (SELECT total_input_chars FROM public.ai_request_quota
          WHERE user_id = sys_user AND endpoint = ep
            AND day = (now() AT TIME ZONE 'UTC')::date) = 200,
    'expected total_input_chars=200 (no rollback leak from denied call)';
  RAISE NOTICE 'OK 4/4 denied call rolled back counters';

  RAISE NOTICE '=== C6 E2E PASSED for endpoint=% ===', ep;
END $$;

ROLLBACK;
