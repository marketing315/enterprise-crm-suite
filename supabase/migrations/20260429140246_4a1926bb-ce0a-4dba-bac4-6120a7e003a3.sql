
-- 1) Rate limit per token
ALTER TABLE public.mcp_access_tokens
  ADD COLUMN IF NOT EXISTS rate_limit_per_min integer NOT NULL DEFAULT 60;

-- 2) Seed ralph-crm-mcp server (idempotente) per consentire kill-switch globale
INSERT INTO public.mcp_servers (name, version, transport, status, description, kill_switch)
VALUES ('ralph-crm-mcp', '1.0.0', 'streamable_http', 'active',
        'External MCP server (Streamable HTTP) — Loop 1/2/3', false)
ON CONFLICT (name, version) DO NOTHING;

-- 3) Rate limit checker
CREATE OR REPLACE FUNCTION public.mcp_check_rate_limit(p_token_id uuid)
RETURNS TABLE (allowed boolean, used integer, max_per_min integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max integer;
  v_used integer;
BEGIN
  SELECT rate_limit_per_min INTO v_max
  FROM public.mcp_access_tokens
  WHERE id = p_token_id AND revoked_at IS NULL;

  IF v_max IS NULL THEN
    RETURN QUERY SELECT false, 0, 0;
    RETURN;
  END IF;

  SELECT count(*)::int INTO v_used
  FROM public.mcp_request_log
  WHERE token_id = p_token_id
    AND created_at > now() - interval '1 minute';

  RETURN QUERY SELECT (v_used < v_max), v_used, v_max;
END;
$$;

-- 4) KPI 24h del server MCP esterno
CREATE OR REPLACE FUNCTION public.mcp_server_kpi(p_window_hours integer DEFAULT 24)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since timestamptz := now() - (p_window_hours || ' hours')::interval;
  v_total integer;
  v_errors integer;
  v_auth_fail integer;
  v_p50 integer;
  v_p95 integer;
  v_top_tools jsonb;
  v_top_errors jsonb;
  v_kill boolean;
  v_active_tokens integer;
BEGIN
  IF NOT (has_role(get_user_id(auth.uid()), 'admin'::app_role)
       OR has_role(get_user_id(auth.uid()), 'ceo'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT count(*)::int,
         count(*) FILTER (WHERE status_code >= 400)::int,
         count(*) FILTER (WHERE error_code = 'AUTH')::int,
         coalesce(percentile_disc(0.5) WITHIN GROUP (ORDER BY duration_ms), 0)::int,
         coalesce(percentile_disc(0.95) WITHIN GROUP (ORDER BY duration_ms), 0)::int
    INTO v_total, v_errors, v_auth_fail, v_p50, v_p95
  FROM public.mcp_request_log
  WHERE created_at >= v_since;

  SELECT coalesce(jsonb_agg(t), '[]'::jsonb)
    INTO v_top_tools
  FROM (
    SELECT tool_name AS name, count(*)::int AS calls,
           coalesce(percentile_disc(0.95) WITHIN GROUP (ORDER BY duration_ms), 0)::int AS p95_ms,
           count(*) FILTER (WHERE status_code >= 400)::int AS errors
    FROM public.mcp_request_log
    WHERE created_at >= v_since AND tool_name IS NOT NULL
    GROUP BY tool_name
    ORDER BY calls DESC
    LIMIT 10
  ) t;

  SELECT coalesce(jsonb_agg(e), '[]'::jsonb)
    INTO v_top_errors
  FROM (
    SELECT error_code AS code, count(*)::int AS occurrences
    FROM public.mcp_request_log
    WHERE created_at >= v_since AND error_code IS NOT NULL
    GROUP BY error_code
    ORDER BY occurrences DESC
    LIMIT 10
  ) e;

  SELECT count(*)::int INTO v_active_tokens
  FROM public.mcp_access_tokens
  WHERE revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > now());

  SELECT kill_switch INTO v_kill
  FROM public.mcp_servers
  WHERE name = 'ralph-crm-mcp'
  ORDER BY created_at DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'window_hours', p_window_hours,
    'total_requests', v_total,
    'error_count', v_errors,
    'auth_failures', v_auth_fail,
    'error_rate', CASE WHEN v_total > 0 THEN round((v_errors::numeric / v_total) * 100, 2) ELSE 0 END,
    'latency_p50_ms', v_p50,
    'latency_p95_ms', v_p95,
    'top_tools', v_top_tools,
    'top_errors', v_top_errors,
    'active_tokens', v_active_tokens,
    'kill_switch_active', coalesce(v_kill, false)
  );
END;
$$;

-- 5) Token attivi con metriche
CREATE OR REPLACE FUNCTION public.mcp_active_tokens()
RETURNS TABLE (
  id uuid,
  name text,
  kind text,
  user_id uuid,
  scopes text[],
  rate_limit_per_min integer,
  created_at timestamptz,
  expires_at timestamptz,
  last_used_at timestamptz,
  requests_24h integer,
  errors_24h integer,
  avg_latency_ms integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (has_role(get_user_id(auth.uid()), 'admin'::app_role)
       OR has_role(get_user_id(auth.uid()), 'ceo'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT t.id, t.name, t.kind, t.user_id, t.scopes, t.rate_limit_per_min,
         t.created_at, t.expires_at, t.last_used_at,
         coalesce(s.calls, 0)::int,
         coalesce(s.errors, 0)::int,
         coalesce(s.avg_latency, 0)::int
  FROM public.mcp_access_tokens t
  LEFT JOIN (
    SELECT token_id,
           count(*) AS calls,
           count(*) FILTER (WHERE status_code >= 400) AS errors,
           avg(duration_ms) AS avg_latency
    FROM public.mcp_request_log
    WHERE created_at > now() - interval '24 hours'
    GROUP BY token_id
  ) s ON s.token_id = t.id
  WHERE t.revoked_at IS NULL
  ORDER BY coalesce(s.calls, 0) DESC, t.created_at DESC
  LIMIT 200;
END;
$$;

-- 6) Kill-switch toggle
CREATE OR REPLACE FUNCTION public.mcp_toggle_server_kill_switch(p_enabled boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(get_user_id(auth.uid()), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.mcp_servers
     SET kill_switch = p_enabled,
         updated_at = now()
   WHERE name = 'ralph-crm-mcp';

  RETURN p_enabled;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mcp_check_rate_limit(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mcp_server_kpi(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_active_tokens() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_toggle_server_kill_switch(boolean) TO authenticated;
