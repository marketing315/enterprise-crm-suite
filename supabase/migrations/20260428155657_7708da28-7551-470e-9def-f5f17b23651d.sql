-- =========================================
-- SLO Error Budget System
-- =========================================
CREATE TABLE public.slo_definitions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  service_name TEXT NOT NULL,
  metric_type TEXT NOT NULL CHECK (metric_type IN ('availability', 'latency', 'error_rate', 'throughput')),
  target_percentage NUMERIC(5,2) NOT NULL CHECK (target_percentage > 0 AND target_percentage <= 100),
  window_days INTEGER NOT NULL DEFAULT 30 CHECK (window_days > 0),
  threshold_value NUMERIC,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.slo_measurements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slo_id UUID NOT NULL REFERENCES public.slo_definitions(id) ON DELETE CASCADE,
  measured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  good_events BIGINT NOT NULL DEFAULT 0,
  total_events BIGINT NOT NULL DEFAULT 0,
  current_sli NUMERIC(7,4),
  error_budget_remaining NUMERIC(7,4),
  burn_rate_1h NUMERIC(7,4),
  burn_rate_6h NUMERIC(7,4),
  burn_rate_24h NUMERIC(7,4),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_slo_measurements_slo_time ON public.slo_measurements(slo_id, measured_at DESC);

ALTER TABLE public.slo_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slo_measurements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage SLO definitions" ON public.slo_definitions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins view SLO measurements" ON public.slo_measurements
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role inserts SLO measurements" ON public.slo_measurements
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =========================================
-- Dependency Inventory (SBOM)
-- =========================================
CREATE TABLE public.dependency_inventory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  package_name TEXT NOT NULL,
  current_version TEXT NOT NULL,
  latest_version TEXT,
  license TEXT,
  is_dev_dependency BOOLEAN NOT NULL DEFAULT false,
  is_outdated BOOLEAN NOT NULL DEFAULT false,
  has_vulnerability BOOLEAN NOT NULL DEFAULT false,
  vulnerability_severity TEXT CHECK (vulnerability_severity IN ('low', 'moderate', 'high', 'critical') OR vulnerability_severity IS NULL),
  vulnerability_details JSONB DEFAULT '[]'::jsonb,
  last_scanned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(package_name)
);

CREATE INDEX idx_dependency_vulns ON public.dependency_inventory(has_vulnerability, vulnerability_severity) WHERE has_vulnerability = true;

ALTER TABLE public.dependency_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage dependency inventory" ON public.dependency_inventory
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =========================================
-- Distributed Tracing
-- =========================================
CREATE TABLE public.trace_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trace_id TEXT NOT NULL,
  span_id TEXT NOT NULL,
  parent_span_id TEXT,
  service_name TEXT NOT NULL,
  operation_name TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  duration_ms INTEGER NOT NULL,
  status_code TEXT NOT NULL DEFAULT 'ok' CHECK (status_code IN ('ok', 'error', 'timeout')),
  http_status INTEGER,
  error_message TEXT,
  attributes JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_trace_events_trace ON public.trace_events(trace_id);
CREATE INDEX idx_trace_events_service_time ON public.trace_events(service_name, started_at DESC);
CREATE INDEX idx_trace_events_errors ON public.trace_events(service_name, started_at DESC) WHERE status_code = 'error';

ALTER TABLE public.trace_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view trace events" ON public.trace_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins insert trace events" ON public.trace_events
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =========================================
-- Functions
-- =========================================
CREATE OR REPLACE FUNCTION public.calculate_slo_burn_rate(p_slo_id UUID)
RETURNS TABLE(
  current_sli NUMERIC,
  error_budget_remaining NUMERIC,
  burn_rate_1h NUMERIC,
  burn_rate_6h NUMERIC,
  burn_rate_24h NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_def RECORD;
  v_total_good BIGINT;
  v_total_all BIGINT;
  v_window_good BIGINT;
  v_window_all BIGINT;
  v_target NUMERIC;
  v_sli NUMERIC;
  v_budget NUMERIC;
  v_burn_1h NUMERIC;
  v_burn_6h NUMERIC;
  v_burn_24h NUMERIC;
BEGIN
  SELECT * INTO v_def FROM public.slo_definitions WHERE id = p_slo_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_target := v_def.target_percentage / 100.0;

  -- Full window SLI
  SELECT COALESCE(SUM(good_events), 0), COALESCE(SUM(total_events), 0)
  INTO v_total_good, v_total_all
  FROM public.slo_measurements
  WHERE slo_id = p_slo_id
    AND measured_at >= now() - (v_def.window_days || ' days')::interval;

  v_sli := CASE WHEN v_total_all > 0 THEN v_total_good::numeric / v_total_all ELSE 1 END;
  v_budget := CASE WHEN (1 - v_target) > 0 THEN ((v_sli - v_target) / (1 - v_target)) * 100 ELSE 100 END;

  -- Burn rates (errors per period / allowed errors)
  SELECT COALESCE(SUM(good_events), 0), COALESCE(SUM(total_events), 0)
  INTO v_window_good, v_window_all
  FROM public.slo_measurements
  WHERE slo_id = p_slo_id AND measured_at >= now() - interval '1 hour';
  v_burn_1h := CASE WHEN v_window_all > 0 AND (1 - v_target) > 0
    THEN ((v_window_all - v_window_good)::numeric / v_window_all) / (1 - v_target)
    ELSE 0 END;

  SELECT COALESCE(SUM(good_events), 0), COALESCE(SUM(total_events), 0)
  INTO v_window_good, v_window_all
  FROM public.slo_measurements
  WHERE slo_id = p_slo_id AND measured_at >= now() - interval '6 hours';
  v_burn_6h := CASE WHEN v_window_all > 0 AND (1 - v_target) > 0
    THEN ((v_window_all - v_window_good)::numeric / v_window_all) / (1 - v_target)
    ELSE 0 END;

  SELECT COALESCE(SUM(good_events), 0), COALESCE(SUM(total_events), 0)
  INTO v_window_good, v_window_all
  FROM public.slo_measurements
  WHERE slo_id = p_slo_id AND measured_at >= now() - interval '24 hours';
  v_burn_24h := CASE WHEN v_window_all > 0 AND (1 - v_target) > 0
    THEN ((v_window_all - v_window_good)::numeric / v_window_all) / (1 - v_target)
    ELSE 0 END;

  RETURN QUERY SELECT v_sli, v_budget, v_burn_1h, v_burn_6h, v_burn_24h;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_slo_snapshot()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slo RECORD;
  v_good BIGINT;
  v_total BIGINT;
  v_count INTEGER := 0;
  v_calc RECORD;
BEGIN
  FOR v_slo IN SELECT * FROM public.slo_definitions WHERE is_active = true LOOP
    -- Default: derive from trace_events for last 5 minutes
    SELECT 
      COUNT(*) FILTER (WHERE status_code = 'ok'),
      COUNT(*)
    INTO v_good, v_total
    FROM public.trace_events
    WHERE service_name = v_slo.service_name
      AND started_at >= now() - interval '5 minutes';

    INSERT INTO public.slo_measurements(slo_id, good_events, total_events)
    VALUES (v_slo.id, COALESCE(v_good, 0), COALESCE(v_total, 0));

    SELECT * INTO v_calc FROM public.calculate_slo_burn_rate(v_slo.id);
    UPDATE public.slo_measurements
    SET current_sli = v_calc.current_sli,
        error_budget_remaining = v_calc.error_budget_remaining,
        burn_rate_1h = v_calc.burn_rate_1h,
        burn_rate_6h = v_calc.burn_rate_6h,
        burn_rate_24h = v_calc.burn_rate_24h
    WHERE slo_id = v_slo.id
      AND id = (SELECT id FROM public.slo_measurements WHERE slo_id = v_slo.id ORDER BY measured_at DESC LIMIT 1);

    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_old_traces()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.trace_events WHERE created_at < now() - interval '14 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  DELETE FROM public.slo_measurements WHERE measured_at < now() - interval '90 days';
  RETURN v_deleted;
END;
$$;

-- Trigger for updated_at
CREATE TRIGGER trg_slo_definitions_updated
BEFORE UPDATE ON public.slo_definitions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default SLOs
INSERT INTO public.slo_definitions (name, description, service_name, metric_type, target_percentage, window_days)
VALUES
  ('webhook-ingest-availability', 'Webhook ingest service availability', 'webhook-ingest', 'availability', 99.5, 30),
  ('siem-exporter-availability', 'SIEM exporter delivery success', 'siem-exporter', 'availability', 99.0, 30),
  ('ai-agent-availability', 'AI agent response success rate', 'ai-agent', 'availability', 98.0, 30)
ON CONFLICT (name) DO NOTHING;