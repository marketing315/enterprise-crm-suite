-- =========================================================
-- MCP Server (Loop 1) — Token + Request Log (additive only)
-- =========================================================

CREATE TABLE IF NOT EXISTS public.mcp_access_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT NOT NULL UNIQUE,
  token_prefix TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'user' CHECK (kind IN ('user','service')),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  brand_id UUID,
  scopes TEXT[] NOT NULL DEFAULT ARRAY['crm.read']::TEXT[],
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT mcp_access_tokens_user_required
    CHECK (kind = 'service' OR user_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_mcp_tokens_hash ON public.mcp_access_tokens(token_hash) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mcp_tokens_user ON public.mcp_access_tokens(user_id) WHERE revoked_at IS NULL;

ALTER TABLE public.mcp_access_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mcp_tokens_select_own_or_admin"
  ON public.mcp_access_tokens FOR SELECT
  TO authenticated
  USING (
    user_id = public.get_user_id(auth.uid())
    OR public.has_role(public.get_user_id(auth.uid()), 'admin'::public.app_role)
    OR public.has_role(public.get_user_id(auth.uid()), 'ceo'::public.app_role)
  );

CREATE POLICY "mcp_tokens_insert_self"
  ON public.mcp_access_tokens FOR INSERT
  TO authenticated
  WITH CHECK (
    (user_id = public.get_user_id(auth.uid()) AND kind = 'user')
    OR public.has_role(public.get_user_id(auth.uid()), 'admin'::public.app_role)
  );

CREATE POLICY "mcp_tokens_update_own_or_admin"
  ON public.mcp_access_tokens FOR UPDATE
  TO authenticated
  USING (
    user_id = public.get_user_id(auth.uid())
    OR public.has_role(public.get_user_id(auth.uid()), 'admin'::public.app_role)
  );

CREATE TABLE IF NOT EXISTS public.mcp_request_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id TEXT NOT NULL,
  token_id UUID REFERENCES public.mcp_access_tokens(id) ON DELETE SET NULL,
  user_id UUID,
  brand_id UUID,
  method TEXT NOT NULL,
  tool_name TEXT,
  status_code INT NOT NULL,
  error_code TEXT,
  duration_ms INT NOT NULL DEFAULT 0,
  request_size INT,
  response_size INT,
  client_ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mcp_req_log_created ON public.mcp_request_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mcp_req_log_token ON public.mcp_request_log(token_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mcp_req_log_method ON public.mcp_request_log(method, created_at DESC);

ALTER TABLE public.mcp_request_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mcp_req_log_select_admins"
  ON public.mcp_request_log FOR SELECT
  TO authenticated
  USING (
    public.has_role(public.get_user_id(auth.uid()), 'admin'::public.app_role)
    OR public.has_role(public.get_user_id(auth.uid()), 'ceo'::public.app_role)
  );

-- RPC: issue token (returns raw value once)
CREATE OR REPLACE FUNCTION public.issue_mcp_token(
  p_name TEXT,
  p_kind TEXT DEFAULT 'user',
  p_scopes TEXT[] DEFAULT ARRAY['crm.read']::TEXT[],
  p_expires_at TIMESTAMPTZ DEFAULT NULL,
  p_brand_id UUID DEFAULT NULL
)
RETURNS TABLE(token TEXT, token_id UUID, prefix TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_raw TEXT;
  v_hash TEXT;
  v_prefix TEXT;
  v_id UUID;
BEGIN
  v_user_id := public.get_user_id(auth.uid());
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  IF p_kind = 'service' AND NOT public.has_role(v_user_id, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'service tokens require admin' USING ERRCODE = '42501';
  END IF;

  v_raw := 'mcp_' || encode(gen_random_bytes(36), 'base64');
  v_raw := replace(replace(replace(v_raw, '+', '-'), '/', '_'), '=', '');
  v_prefix := substr(v_raw, 1, 12);
  v_hash := encode(digest(v_raw, 'sha256'), 'hex');

  INSERT INTO public.mcp_access_tokens(
    token_hash, token_prefix, name, kind, user_id, brand_id, scopes, expires_at, created_by
  ) VALUES (
    v_hash, v_prefix, p_name, p_kind,
    CASE WHEN p_kind = 'user' THEN v_user_id ELSE NULL END,
    p_brand_id, p_scopes, p_expires_at, v_user_id
  )
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_raw, v_id, v_prefix;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_mcp_token(TEXT, TEXT, TEXT[], TIMESTAMPTZ, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_mcp_token(TEXT, TEXT, TEXT[], TIMESTAMPTZ, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.revoke_mcp_token(p_token_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := public.get_user_id(auth.uid());
  IF v_user_id IS NULL THEN RETURN FALSE; END IF;

  UPDATE public.mcp_access_tokens
  SET revoked_at = now()
  WHERE id = p_token_id
    AND revoked_at IS NULL
    AND (
      user_id = v_user_id
      OR public.has_role(v_user_id, 'admin'::public.app_role)
    );

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_mcp_token(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_mcp_token(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.validate_mcp_token(p_raw_token TEXT)
RETURNS TABLE(
  token_id UUID,
  user_id UUID,
  kind TEXT,
  brand_id UUID,
  scopes TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash TEXT;
BEGIN
  IF p_raw_token IS NULL OR length(p_raw_token) < 16 THEN RETURN; END IF;
  v_hash := encode(digest(p_raw_token, 'sha256'), 'hex');

  RETURN QUERY
  UPDATE public.mcp_access_tokens t
  SET last_used_at = now()
  WHERE t.token_hash = v_hash
    AND t.revoked_at IS NULL
    AND (t.expires_at IS NULL OR t.expires_at > now())
  RETURNING t.id, t.user_id, t.kind, t.brand_id, t.scopes;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_mcp_token(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_mcp_token(TEXT) TO service_role;