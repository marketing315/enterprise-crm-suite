-- SOC2 + CAPACITY + ANOMALY infrastructure

CREATE TABLE IF NOT EXISTS public.access_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid,
  review_period text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','overdue')),
  reviewer_user_id uuid,
  total_users int NOT NULL DEFAULT 0,
  reviewed_users int NOT NULL DEFAULT 0,
  revoked_count int NOT NULL DEFAULT 0,
  notes text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(brand_id, review_period)
);

CREATE TABLE IF NOT EXISTS public.access_review_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.access_reviews(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  user_email text,
  current_role_label text,
  last_login_at timestamptz,
  decision text CHECK (decision IN ('keep','revoke','change_role','pending')),
  decision_notes text,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.access_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_review_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage access reviews" ON public.access_reviews FOR ALL
  USING (has_role(get_user_id(auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role(get_user_id(auth.uid()), 'admin'::app_role));

CREATE POLICY "Admins manage access review items" ON public.access_review_items FOR ALL
  USING (has_role(get_user_id(auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role(get_user_id(auth.uid()), 'admin'::app_role));

CREATE INDEX idx_access_reviews_period ON public.access_reviews(review_period);
CREATE INDEX idx_access_review_items_review ON public.access_review_items(review_id);

CREATE TABLE IF NOT EXISTS public.compliance_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  change_type text NOT NULL CHECK (change_type IN (
    'role_grant','role_revoke','permission_change','rls_policy_change',
    'secret_rotation','config_change','migration','user_provisioning','user_deactivation'
  )),
  actor_user_id uuid,
  actor_email text,
  target_user_id uuid,
  target_resource text,
  old_value jsonb,
  new_value jsonb,
  reason text,
  brand_id uuid,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.compliance_change_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read compliance log" ON public.compliance_change_log FOR SELECT
  USING (has_role(get_user_id(auth.uid()), 'admin'::app_role));
CREATE POLICY "Service inserts compliance log" ON public.compliance_change_log FOR INSERT WITH CHECK (true);

REVOKE UPDATE, DELETE ON public.compliance_change_log FROM authenticated, anon;

CREATE INDEX idx_compliance_change_occurred ON public.compliance_change_log(occurred_at DESC);
CREATE INDEX idx_compliance_change_type ON public.compliance_change_log(change_type);

CREATE TABLE IF NOT EXISTS public.compliance_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_type text NOT NULL CHECK (evidence_type IN (
    'access_review','backup_verification','incident_response','vulnerability_scan',
    'training_completion','policy_acceptance','penetration_test','dr_drill'
  )),
  period text NOT NULL,
  brand_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  collected_by_user_id uuid,
  collected_at timestamptz NOT NULL DEFAULT now(),
  hash_sha256 text,
  notes text
);

ALTER TABLE public.compliance_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage evidence" ON public.compliance_evidence FOR ALL
  USING (has_role(get_user_id(auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role(get_user_id(auth.uid()), 'admin'::app_role));

CREATE INDEX idx_compliance_evidence_period ON public.compliance_evidence(period, evidence_type);

CREATE TABLE IF NOT EXISTS public.capacity_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_name text NOT NULL,
  metric_value numeric NOT NULL,
  unit text,
  brand_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  captured_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.capacity_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read capacity" ON public.capacity_snapshots FOR SELECT
  USING (has_role(get_user_id(auth.uid()), 'admin'::app_role));
CREATE POLICY "Service writes capacity" ON public.capacity_snapshots FOR INSERT WITH CHECK (true);

CREATE INDEX idx_capacity_metric_time ON public.capacity_snapshots(metric_name, captured_at DESC);

CREATE TABLE IF NOT EXISTS public.capacity_thresholds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_name text NOT NULL UNIQUE,
  warn_threshold numeric NOT NULL,
  critical_threshold numeric NOT NULL,
  unit text,
  growth_rate_warn_pct numeric,
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.capacity_thresholds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage thresholds" ON public.capacity_thresholds FOR ALL
  USING (has_role(get_user_id(auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role(get_user_id(auth.uid()), 'admin'::app_role));

INSERT INTO public.capacity_thresholds (metric_name, warn_threshold, critical_threshold, unit, growth_rate_warn_pct) VALUES
  ('db_size_mb', 5000, 8000, 'MB', 15),
  ('contacts_count', 100000, 250000, 'rows', 20),
  ('webhooks_per_day', 50000, 100000, 'count', 25),
  ('edge_invocations_per_day', 200000, 500000, 'count', 30),
  ('audit_events_per_day', 100000, 250000, 'count', 25),
  ('failed_jobs_count', 100, 500, 'count', 50)
ON CONFLICT (metric_name) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.anomaly_baselines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_name text NOT NULL,
  brand_id uuid,
  window_hours int NOT NULL DEFAULT 24,
  mean_value numeric NOT NULL,
  stddev_value numeric NOT NULL,
  sample_count int NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(metric_name, brand_id, window_hours)
);

CREATE TABLE IF NOT EXISTS public.anomaly_detections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_name text NOT NULL,
  brand_id uuid,
  observed_value numeric NOT NULL,
  expected_value numeric NOT NULL,
  z_score numeric NOT NULL,
  severity text NOT NULL CHECK (severity IN ('info','warning','critical')),
  direction text NOT NULL CHECK (direction IN ('spike','drop')),
  context jsonb DEFAULT '{}'::jsonb,
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  detected_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.anomaly_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anomaly_detections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read baselines" ON public.anomaly_baselines FOR SELECT
  USING (has_role(get_user_id(auth.uid()), 'admin'::app_role));
CREATE POLICY "Service writes baselines" ON public.anomaly_baselines FOR INSERT WITH CHECK (true);
CREATE POLICY "Service updates baselines" ON public.anomaly_baselines FOR UPDATE USING (true);

CREATE POLICY "Admins manage detections" ON public.anomaly_detections FOR ALL
  USING (has_role(get_user_id(auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role(get_user_id(auth.uid()), 'admin'::app_role));
CREATE POLICY "Service inserts detections" ON public.anomaly_detections FOR INSERT WITH CHECK (true);

CREATE INDEX idx_anomaly_detections_time ON public.anomaly_detections(detected_at DESC);
CREATE INDEX idx_anomaly_detections_unack ON public.anomaly_detections(detected_at DESC) WHERE acknowledged_at IS NULL;

CREATE OR REPLACE FUNCTION public.capture_capacity_snapshot()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_db_size_mb numeric;
  v_contacts_count bigint;
  v_webhooks_today bigint;
  v_audit_today bigint;
  v_failed_jobs bigint;
BEGIN
  SELECT pg_database_size(current_database())::numeric / 1024 / 1024 INTO v_db_size_mb;
  SELECT count(*) INTO v_contacts_count FROM public.contacts;
  SELECT count(*) INTO v_webhooks_today FROM public.incoming_requests WHERE received_at > now() - interval '24 hours';
  SELECT count(*) INTO v_audit_today FROM public.audit_events WHERE occurred_at > now() - interval '24 hours';
  SELECT count(*) INTO v_failed_jobs FROM public.incoming_requests WHERE status = 'failed';

  INSERT INTO public.capacity_snapshots (metric_name, metric_value, unit) VALUES
    ('db_size_mb', v_db_size_mb, 'MB'),
    ('contacts_count', v_contacts_count, 'rows'),
    ('webhooks_per_day', v_webhooks_today, 'count'),
    ('audit_events_per_day', v_audit_today, 'count'),
    ('failed_jobs_count', v_failed_jobs, 'count');

  RETURN jsonb_build_object(
    'db_size_mb', v_db_size_mb,
    'contacts_count', v_contacts_count,
    'webhooks_per_day', v_webhooks_today,
    'audit_events_per_day', v_audit_today,
    'failed_jobs_count', v_failed_jobs,
    'captured_at', now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_anomaly_baselines()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int := 0;
BEGIN
  INSERT INTO public.anomaly_baselines (metric_name, window_hours, mean_value, stddev_value, sample_count)
  SELECT metric_name, 24, avg(metric_value), coalesce(stddev_pop(metric_value), 0), count(*)::int
  FROM public.capacity_snapshots
  WHERE captured_at > now() - interval '14 days'
  GROUP BY metric_name
  HAVING count(*) >= 5
  ON CONFLICT (metric_name, brand_id, window_hours) DO UPDATE
    SET mean_value = EXCLUDED.mean_value,
        stddev_value = EXCLUDED.stddev_value,
        sample_count = EXCLUDED.sample_count,
        computed_at = now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('baselines_refreshed', v_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.detect_anomalies(p_lookback_hours int DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_metric record;
  v_observed numeric;
  v_z numeric;
  v_severity text;
  v_direction text;
  v_count int := 0;
BEGIN
  FOR v_metric IN
    SELECT b.metric_name, b.mean_value, b.stddev_value
    FROM public.anomaly_baselines b
    WHERE b.stddev_value > 0
  LOOP
    SELECT avg(metric_value) INTO v_observed
    FROM public.capacity_snapshots
    WHERE metric_name = v_metric.metric_name
      AND captured_at > now() - (p_lookback_hours || ' hours')::interval;

    IF v_observed IS NULL THEN CONTINUE; END IF;

    v_z := (v_observed - v_metric.mean_value) / NULLIF(v_metric.stddev_value, 0);
    IF abs(v_z) < 2 THEN CONTINUE; END IF;

    v_severity := CASE WHEN abs(v_z) >= 4 THEN 'critical' WHEN abs(v_z) >= 3 THEN 'warning' ELSE 'info' END;
    v_direction := CASE WHEN v_z > 0 THEN 'spike' ELSE 'drop' END;

    INSERT INTO public.anomaly_detections (metric_name, observed_value, expected_value, z_score, severity, direction)
    VALUES (v_metric.metric_name, v_observed, v_metric.mean_value, v_z, v_severity, v_direction);
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('anomalies_detected', v_count, 'checked_at', now());
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_access_review(p_period text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_review_id uuid;
  v_total int;
BEGIN
  IF NOT has_role(get_user_id(auth.uid()), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can generate access reviews';
  END IF;

  INSERT INTO public.access_reviews (review_period, reviewer_user_id, status, started_at)
  VALUES (p_period, get_user_id(auth.uid()), 'in_progress', now())
  ON CONFLICT (brand_id, review_period) DO UPDATE
    SET status = 'in_progress', started_at = now()
  RETURNING id INTO v_review_id;

  INSERT INTO public.access_review_items (review_id, user_id, user_email, current_role_label, decision)
  SELECT v_review_id, u.id, u.email, string_agg(DISTINCT ur.role::text, ', '), 'pending'
  FROM public.users u
  LEFT JOIN public.user_roles ur ON ur.user_id = u.id
  WHERE u.is_active = true
  GROUP BY u.id, u.email;

  GET DIAGNOSTICS v_total = ROW_COUNT;
  UPDATE public.access_reviews SET total_users = v_total WHERE id = v_review_id;

  RETURN v_review_id;
END;
$$;