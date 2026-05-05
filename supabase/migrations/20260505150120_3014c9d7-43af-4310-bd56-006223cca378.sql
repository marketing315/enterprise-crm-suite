
-- H2: generic rate limit for critical RPCs (riusa auth_rate_limit estendendo lo scope)

ALTER TABLE public.auth_rate_limit DROP CONSTRAINT IF EXISTS auth_rate_limit_scope_check;
ALTER TABLE public.auth_rate_limit ADD CONSTRAINT auth_rate_limit_scope_check
  CHECK (scope = ANY (ARRAY[
    'signin','password_reset',
    'rpc.grant_user_role','rpc.revoke_user_role','rpc.merge_contacts',
    'rpc.backup_signed_url','rpc.create_oauth_session'
  ]));

-- Generic limiter: configurable max + window + lock per scope.
CREATE OR REPLACE FUNCTION public.consume_critical_rate_limit(
  p_identity_hash text,
  p_scope text,
  p_max_attempts int DEFAULT 20,
  p_window_minutes int DEFAULT 15,
  p_lock_minutes int DEFAULT 15
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row public.auth_rate_limit;
  v_now timestamptz := now();
BEGIN
  IF p_scope IS NULL OR length(p_scope) = 0 THEN
    RETURN jsonb_build_object('allowed', false, 'error', 'invalid_scope');
  END IF;

  INSERT INTO public.auth_rate_limit(identity_hash, scope, attempts, window_started_at, last_attempt_at)
  VALUES (p_identity_hash, p_scope, 1, v_now, v_now)
  ON CONFLICT (identity_hash, scope) DO UPDATE
    SET attempts = CASE
        WHEN public.auth_rate_limit.locked_until IS NOT NULL AND public.auth_rate_limit.locked_until > v_now
          THEN public.auth_rate_limit.attempts
        WHEN public.auth_rate_limit.window_started_at < v_now - (p_window_minutes || ' minutes')::interval
          THEN 1
        ELSE public.auth_rate_limit.attempts + 1
      END,
      window_started_at = CASE
        WHEN public.auth_rate_limit.locked_until IS NOT NULL AND public.auth_rate_limit.locked_until > v_now
          THEN public.auth_rate_limit.window_started_at
        WHEN public.auth_rate_limit.window_started_at < v_now - (p_window_minutes || ' minutes')::interval
          THEN v_now
        ELSE public.auth_rate_limit.window_started_at
      END,
      last_attempt_at = v_now
  RETURNING * INTO v_row;

  IF v_row.locked_until IS NOT NULL AND v_row.locked_until > v_now THEN
    RETURN jsonb_build_object(
      'allowed', false, 'locked', true,
      'retry_after_seconds', GREATEST(1, EXTRACT(EPOCH FROM (v_row.locked_until - v_now))::int)
    );
  END IF;

  IF v_row.attempts > p_max_attempts THEN
    UPDATE public.auth_rate_limit
       SET locked_until = v_now + (p_lock_minutes || ' minutes')::interval
     WHERE id = v_row.id;
    RETURN jsonb_build_object(
      'allowed', false, 'locked', true,
      'retry_after_seconds', p_lock_minutes * 60
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'attempts', v_row.attempts,
    'remaining', GREATEST(0, p_max_attempts - v_row.attempts)
  );
END$$;

REVOKE ALL ON FUNCTION public.consume_critical_rate_limit(text,text,int,int,int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_critical_rate_limit(text,text,int,int,int) TO authenticated, service_role;

-- Monitoring view (admin-only via RLS-equivalent: invoker doesn't apply on view, so we filter)
CREATE OR REPLACE VIEW public.critical_rate_limit_summary
WITH (security_invoker = true)
AS
SELECT
  scope,
  count(*) FILTER (WHERE locked_until IS NOT NULL AND locked_until > now())     AS currently_locked,
  count(*) FILTER (WHERE attempts >= 15 AND (locked_until IS NULL OR locked_until <= now())) AS approaching_limit,
  count(*)                                                                     AS active_buckets,
  max(last_attempt_at)                                                         AS last_activity_at
FROM public.auth_rate_limit
WHERE scope LIKE 'rpc.%'
GROUP BY scope;

GRANT SELECT ON public.critical_rate_limit_summary TO authenticated;

-- Wrap grant_user_role with rate-limit (preserve existing signature/behavior).
CREATE OR REPLACE FUNCTION public.grant_user_role(
  p_user_id uuid,
  p_brand_id uuid,
  p_role app_role,
  p_can_access_children boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
  v_caller uuid := public.get_user_id(auth.uid());
  v_rl jsonb;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  -- H2 rate limit: 20 grants / 15 min / caller
  v_rl := public.consume_critical_rate_limit(
    encode(digest(v_caller::text, 'sha256'), 'hex'),
    'rpc.grant_user_role', 20, 15, 15
  );
  IF NOT (v_rl->>'allowed')::boolean THEN
    PERFORM public.log_rpc_call('grant_user_role',
      jsonb_build_object('user_id',p_user_id,'brand_id',p_brand_id,'role',p_role),
      v_rl, 'rate_limited', p_brand_id);
    RAISE EXCEPTION 'rate_limited: retry after % s', (v_rl->>'retry_after_seconds')
      USING ERRCODE = '42P01';
  END IF;

  IF NOT public.can_manage_role_in_brand(p_brand_id, p_role) THEN
    PERFORM public.log_rpc_call('grant_user_role',
      jsonb_build_object('user_id',p_user_id,'brand_id',p_brand_id,'role',p_role),
      NULL, 'denied', p_brand_id);
    RAISE EXCEPTION 'caller cannot manage role % on brand %', p_role, p_brand_id
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.user_roles(user_id, brand_id, role, can_access_children, is_active)
  VALUES (p_user_id, p_brand_id, p_role, p_can_access_children, true)
  ON CONFLICT (user_id, brand_id, role)
  DO UPDATE SET is_active = true, can_access_children = EXCLUDED.can_access_children
  RETURNING id INTO v_id;

  PERFORM public.log_rpc_call('grant_user_role',
    jsonb_build_object('user_id',p_user_id,'brand_id',p_brand_id,'role',p_role),
    jsonb_build_object('id',v_id), 'ok', p_brand_id);

  RETURN v_id;
END$$;

CREATE OR REPLACE FUNCTION public.revoke_user_role(
  p_user_id uuid,
  p_brand_id uuid,
  p_role app_role
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := public.get_user_id(auth.uid());
  v_found boolean := false;
  v_rl jsonb;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  v_rl := public.consume_critical_rate_limit(
    encode(digest(v_caller::text, 'sha256'), 'hex'),
    'rpc.revoke_user_role', 20, 15, 15
  );
  IF NOT (v_rl->>'allowed')::boolean THEN
    PERFORM public.log_rpc_call('revoke_user_role',
      jsonb_build_object('user_id',p_user_id,'brand_id',p_brand_id,'role',p_role),
      v_rl, 'rate_limited', p_brand_id);
    RAISE EXCEPTION 'rate_limited: retry after % s', (v_rl->>'retry_after_seconds')
      USING ERRCODE = '42P01';
  END IF;

  IF NOT public.can_manage_role_in_brand(p_brand_id, p_role) THEN
    PERFORM public.log_rpc_call('revoke_user_role',
      jsonb_build_object('user_id',p_user_id,'brand_id',p_brand_id,'role',p_role),
      NULL, 'denied', p_brand_id);
    RAISE EXCEPTION 'caller cannot manage role % on brand %', p_role, p_brand_id
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.user_roles
     SET is_active = false
   WHERE user_id = p_user_id
     AND brand_id = p_brand_id
     AND role = p_role
     AND is_active = true;
  GET DIAGNOSTICS v_found = ROW_COUNT;

  PERFORM public.log_rpc_call('revoke_user_role',
    jsonb_build_object('user_id',p_user_id,'brand_id',p_brand_id,'role',p_role),
    jsonb_build_object('updated', v_found), 'ok', p_brand_id);

  RETURN v_found;
END$$;
