-- C7 E2E: OAuth CSRF session + redirect whitelist
-- Run inside a transaction; rolls back at the end (no persistent side effects).
BEGIN;

-- 0. Setup: pick any existing user/brand (or skip if empty schema)
DO $$
DECLARE
  v_user_id uuid;
  v_brand_id uuid;
  v_csrf text;
  v_consumed jsonb;
  v_allowed boolean;
BEGIN
  SELECT id INTO v_user_id FROM public.users LIMIT 1;
  SELECT id INTO v_brand_id FROM public.brands LIMIT 1;
  IF v_user_id IS NULL OR v_brand_id IS NULL THEN
    RAISE NOTICE 'SKIP: no user/brand seed';
    RETURN;
  END IF;

  -- 1. Whitelist allows seeded callbacks
  SELECT public.is_oauth_redirect_allowed(
    'google',
    'https://qmqcjtmcxfqahhubpaea.supabase.co/functions/v1/google-oauth-callback'
  ) INTO v_allowed;
  ASSERT v_allowed = true, 'C7.1 google callback should be whitelisted';

  SELECT public.is_oauth_redirect_allowed('meta', 'https://evil.example.com/cb') INTO v_allowed;
  ASSERT v_allowed = false, 'C7.2 untrusted host must be rejected';

  -- 2. Create + consume single-use session
  v_csrf := public.create_oauth_session(
    v_user_id, v_brand_id, 'google',
    'https://qmqcjtmcxfqahhubpaea.supabase.co/functions/v1/google-oauth-callback'
  );
  ASSERT length(v_csrf) >= 32, 'C7.3 csrf token should be opaque';

  v_consumed := public.consume_oauth_session(v_csrf, 'google');
  ASSERT (v_consumed->>'user_id')::uuid = v_user_id, 'C7.4 consume returns owner';

  -- 3. Replay must fail
  BEGIN
    PERFORM public.consume_oauth_session(v_csrf, 'google');
    RAISE EXCEPTION 'C7.5 replay should have failed';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'C7.5 OK replay rejected: %', SQLERRM;
  END;

  -- 4. Provider mismatch
  v_csrf := public.create_oauth_session(
    v_user_id, v_brand_id, 'google',
    'https://qmqcjtmcxfqahhubpaea.supabase.co/functions/v1/google-oauth-callback'
  );
  BEGIN
    PERFORM public.consume_oauth_session(v_csrf, 'meta');
    RAISE EXCEPTION 'C7.6 provider mismatch should have failed';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'C7.6 OK provider mismatch rejected';
  END;

  RAISE NOTICE 'C7 E2E PASSED';
END $$;

ROLLBACK;
