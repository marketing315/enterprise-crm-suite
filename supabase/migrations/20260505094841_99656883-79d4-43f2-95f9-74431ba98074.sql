CREATE TABLE IF NOT EXISTS public.session_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  auth_user_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('signin', 'signout', 'token_refresh', 'password_reset', 'mfa_enroll', 'mfa_challenge_success', 'mfa_challenge_failed', 'session_revoked')),
  ip_address TEXT,
  user_agent TEXT,
  session_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  revoked_at TIMESTAMPTZ,
  revoked_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_session_audit_user_id ON public.session_audit(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_session_audit_auth_user ON public.session_audit(auth_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_session_audit_session ON public.session_audit(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_session_audit_created_at ON public.session_audit(created_at DESC);

ALTER TABLE public.session_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "session_audit_select_own"
ON public.session_audit
FOR SELECT
TO authenticated
USING (user_id = public.get_user_id(auth.uid()));

CREATE POLICY "session_audit_select_admin"
ON public.session_audit
FOR SELECT
TO authenticated
USING (
  public.has_role(public.get_user_id(auth.uid()), 'admin'::app_role)
  OR public.has_role(public.get_user_id(auth.uid()), 'ceo'::app_role)
);

CREATE POLICY "session_audit_insert_service"
ON public.session_audit
FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "session_audit_update_admin"
ON public.session_audit
FOR UPDATE
TO authenticated
USING (public.has_role(public.get_user_id(auth.uid()), 'admin'::app_role))
WITH CHECK (public.has_role(public.get_user_id(auth.uid()), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.log_session_event(
  p_event_type TEXT,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_session_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_uid UUID := auth.uid();
  v_user_id UUID;
  v_id UUID;
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  v_user_id := public.get_user_id(v_auth_uid);
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF p_event_type NOT IN ('signin', 'signout', 'token_refresh', 'password_reset', 'mfa_enroll', 'mfa_challenge_success', 'mfa_challenge_failed') THEN
    RAISE EXCEPTION 'invalid_event_type: %', p_event_type;
  END IF;

  INSERT INTO public.session_audit (user_id, auth_user_id, event_type, ip_address, user_agent, session_id, metadata)
  VALUES (
    v_user_id, v_auth_uid, p_event_type,
    LEFT(COALESCE(p_ip_address, ''), 64),
    LEFT(COALESCE(p_user_agent, ''), 512),
    LEFT(COALESCE(p_session_id, ''), 128),
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_session_event(TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_session_event(TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_session_events(
  p_user_id UUID DEFAULT NULL,
  p_event_type TEXT DEFAULT NULL,
  p_limit INT DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  user_email TEXT,
  user_name TEXT,
  event_type TEXT,
  ip_address TEXT,
  user_agent TEXT,
  session_id TEXT,
  metadata JSONB,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_uid UUID := auth.uid();
  v_caller_id UUID;
  v_is_admin BOOLEAN;
  v_lim INT := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
BEGIN
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  v_caller_id := public.get_user_id(v_caller_uid);
  v_is_admin := public.has_role(v_caller_id, 'admin'::app_role)
             OR public.has_role(v_caller_id, 'ceo'::app_role);

  RETURN QUERY
  SELECT
    s.id,
    s.user_id,
    u.email::TEXT,
    COALESCE(u.full_name, u.email)::TEXT,
    s.event_type,
    s.ip_address,
    s.user_agent,
    s.session_id,
    s.metadata,
    s.revoked_at,
    s.created_at
  FROM public.session_audit s
  LEFT JOIN public.users u ON u.id = s.user_id
  WHERE
    (v_is_admin OR s.user_id = v_caller_id)
    AND (p_user_id IS NULL OR s.user_id = p_user_id)
    AND (p_event_type IS NULL OR s.event_type = p_event_type)
  ORDER BY s.created_at DESC
  LIMIT v_lim;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.list_session_events(UUID, TEXT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_session_events(UUID, TEXT, INT) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_session_revoked(
  p_session_audit_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_uid UUID := auth.uid();
  v_caller_id UUID;
BEGIN
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  v_caller_id := public.get_user_id(v_caller_uid);

  IF NOT public.has_role(v_caller_id, 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.session_audit
  SET revoked_at = now(),
      revoked_by = v_caller_id,
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('revoke_reason', p_reason)
  WHERE id = p_session_audit_id
    AND revoked_at IS NULL;

  RETURN FOUND;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_session_revoked(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_session_revoked(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.cleanup_session_audit()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  DELETE FROM public.session_audit
  WHERE created_at < now() - INTERVAL '90 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cleanup_session_audit() FROM PUBLIC, anon, authenticated;