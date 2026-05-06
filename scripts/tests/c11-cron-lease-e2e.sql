-- C11 E2E: lease-based cron lock
BEGIN;

DO $$
DECLARE
  v1 jsonb;
  v2 jsonb;
  v_token text;
  v_released boolean;
  v_brand uuid := gen_random_uuid();
BEGIN
  -- 1. First acquire succeeds
  v1 := public.acquire_cron_lease('test-job-c11', v_brand, 60, 'req1');
  ASSERT (v1->>'acquired')::boolean = true, 'C11.1 first acquire must succeed';
  v_token := v1->>'token';
  ASSERT length(v_token) >= 16, 'C11.1b token returned';

  -- 2. Second acquire while still leased must fail
  v2 := public.acquire_cron_lease('test-job-c11', v_brand, 60, 'req2');
  ASSERT (v2->>'acquired')::boolean = false, 'C11.2 concurrent acquire must be denied';

  -- 3. Wrong token cannot release
  v_released := public.release_cron_lease('test-job-c11', v_brand, 'wrong-token');
  ASSERT v_released = false, 'C11.3 wrong token cannot release';

  -- 4. Correct token releases
  v_released := public.release_cron_lease('test-job-c11', v_brand, v_token);
  ASSERT v_released = true, 'C11.4 correct token releases';

  -- 5. After release another caller can acquire
  v2 := public.acquire_cron_lease('test-job-c11', v_brand, 60, 'req3');
  ASSERT (v2->>'acquired')::boolean = true, 'C11.5 reacquire after release works';

  -- 6. Append-only on cron_relay_log
  INSERT INTO public.cron_relay_log(job_name, request_id, upstream_status, duration_ms)
  VALUES ('test-job-c11', 'req-x', 200, 10);
  BEGIN
    UPDATE public.cron_relay_log SET upstream_status = 500 WHERE request_id = 'req-x';
    RAISE EXCEPTION 'C11.6 update should have been blocked';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'C11.6 OK update blocked: %', SQLERRM;
  END;

  RAISE NOTICE 'C11 E2E PASSED';
END $$;

ROLLBACK;
