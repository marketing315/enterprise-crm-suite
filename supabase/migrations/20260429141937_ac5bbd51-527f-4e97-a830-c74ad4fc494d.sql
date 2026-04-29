-- ============================================================
-- MCP Server SLO Alerts (Loop 4 / M4)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.mcp_slo_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type text NOT NULL,                  -- latency_p95 | error_rate | auth_failure_storm | rate_limit_storm | kill_switch_activated
  severity text NOT NULL DEFAULT 'warning',  -- info | warning | critical
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  metric_value numeric,
  threshold numeric,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mcp_slo_alerts_unique_window
    UNIQUE (alert_type, window_start)
);

CREATE INDEX IF NOT EXISTS idx_mcp_slo_alerts_created_at
  ON public.mcp_slo_alerts (created_at DESC);

ALTER TABLE public.mcp_slo_alerts ENABLE ROW LEVEL SECURITY;

-- read: only admins / CEO
CREATE POLICY "mcp_slo_alerts_admin_read"
  ON public.mcp_slo_alerts FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'ceo'::app_role)
  );

-- service role inserts (no client insert)
CREATE POLICY "mcp_slo_alerts_service_insert"
  ON public.mcp_slo_alerts FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- admins can ack (UPDATE only acknowledged_*)
CREATE POLICY "mcp_slo_alerts_admin_ack"
  ON public.mcp_slo_alerts FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'ceo'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'ceo'::app_role)
  );

-- ============================================================
-- RPC: evaluate SLO over last 5 minutes and insert alerts
-- ============================================================
CREATE OR REPLACE FUNCTION public.mcp_evaluate_slo_alerts()
RETURNS TABLE (alert_type text, inserted boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start timestamptz := date_trunc('minute', now()) - interval '5 minutes';
  v_window_end   timestamptz := date_trunc('minute', now());
  v_total int;
  v_errors int;
  v_auth_failures int;
  v_rate_limited int;
  v_p95 numeric;
  v_kill_switch boolean;
BEGIN
  -- Aggregate the last 5-minute window
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE COALESCE(error_code, '') <> '' AND error_code <> 'OK'),
    COUNT(*) FILTER (WHERE error_code = 'AUTH_INVALID' OR error_code = 'AUTH_MISSING'),
    COUNT(*) FILTER (WHERE error_code = 'RATE_LIMITED'),
    COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms), 0)
  INTO v_total, v_errors, v_auth_failures, v_rate_limited, v_p95
  FROM public.mcp_request_log
  WHERE created_at >= v_window_start AND created_at < v_window_end;

  -- Kill-switch state
  SELECT bool_or(kill_switch) INTO v_kill_switch
  FROM public.mcp_servers
  WHERE name = 'ralph-crm-mcp';

  -- Latency p95 > 5000 ms (critical) / > 3000 ms (warning) — only if traffic
  IF v_total >= 10 AND v_p95 > 3000 THEN
    INSERT INTO public.mcp_slo_alerts (alert_type, severity, window_start, window_end, metric_value, threshold, details)
    VALUES ('latency_p95',
            CASE WHEN v_p95 > 5000 THEN 'critical' ELSE 'warning' END,
            v_window_start, v_window_end, v_p95, 3000,
            jsonb_build_object('total_requests', v_total))
    ON CONFLICT (alert_type, window_start) DO NOTHING;
    RETURN QUERY SELECT 'latency_p95'::text, true;
  END IF;

  -- Error rate > 5% critical / > 2% warning
  IF v_total >= 20 AND (v_errors::numeric / v_total) > 0.02 THEN
    INSERT INTO public.mcp_slo_alerts (alert_type, severity, window_start, window_end, metric_value, threshold, details)
    VALUES ('error_rate',
            CASE WHEN (v_errors::numeric / v_total) > 0.05 THEN 'critical' ELSE 'warning' END,
            v_window_start, v_window_end,
            ROUND((v_errors::numeric / v_total)::numeric, 4), 0.02,
            jsonb_build_object('errors', v_errors, 'total', v_total))
    ON CONFLICT (alert_type, window_start) DO NOTHING;
    RETURN QUERY SELECT 'error_rate'::text, true;
  END IF;

  -- Auth failure storm: > 50 in 5 min
  IF v_auth_failures > 50 THEN
    INSERT INTO public.mcp_slo_alerts (alert_type, severity, window_start, window_end, metric_value, threshold, details)
    VALUES ('auth_failure_storm', 'critical', v_window_start, v_window_end, v_auth_failures, 50,
            jsonb_build_object('hint', 'possible brute force; review request_log for ip pattern'))
    ON CONFLICT (alert_type, window_start) DO NOTHING;
    RETURN QUERY SELECT 'auth_failure_storm'::text, true;
  END IF;

  -- Rate limit storm: > 100 hits in 5 min
  IF v_rate_limited > 100 THEN
    INSERT INTO public.mcp_slo_alerts (alert_type, severity, window_start, window_end, metric_value, threshold, details)
    VALUES ('rate_limit_storm', 'warning', v_window_start, v_window_end, v_rate_limited, 100,
            jsonb_build_object('hint', 'consider raising rate_limit_per_min for legitimate tokens'))
    ON CONFLICT (alert_type, window_start) DO NOTHING;
    RETURN QUERY SELECT 'rate_limit_storm'::text, true;
  END IF;

  -- Kill-switch active: emit info alert per window
  IF v_kill_switch THEN
    INSERT INTO public.mcp_slo_alerts (alert_type, severity, window_start, window_end, metric_value, threshold, details)
    VALUES ('kill_switch_activated', 'info', v_window_start, v_window_end, 1, 0,
            jsonb_build_object('message', 'kill switch is currently ON'))
    ON CONFLICT (alert_type, window_start) DO NOTHING;
    RETURN QUERY SELECT 'kill_switch_activated'::text, true;
  END IF;

  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.mcp_evaluate_slo_alerts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_evaluate_slo_alerts() TO authenticated, service_role;

-- ============================================================
-- RPC: recent alerts for admin dashboard
-- ============================================================
CREATE OR REPLACE FUNCTION public.mcp_recent_alerts(p_limit int DEFAULT 50)
RETURNS SETOF public.mcp_slo_alerts
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.mcp_slo_alerts
  WHERE
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'ceo'::app_role)
  ORDER BY created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 500);
$$;

REVOKE ALL ON FUNCTION public.mcp_recent_alerts(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_recent_alerts(int) TO authenticated;

-- ============================================================
-- RPC: acknowledge alert
-- ============================================================
CREATE OR REPLACE FUNCTION public.mcp_acknowledge_alert(p_alert_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'ceo'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.mcp_slo_alerts
  SET acknowledged_at = now(),
      acknowledged_by = auth.uid()
  WHERE id = p_alert_id
    AND acknowledged_at IS NULL;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.mcp_acknowledge_alert(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_acknowledge_alert(uuid) TO authenticated;