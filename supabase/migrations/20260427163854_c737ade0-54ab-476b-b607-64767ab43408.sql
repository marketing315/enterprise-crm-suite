-- Compliance reports table
CREATE TABLE public.audit_compliance_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id UUID NOT NULL,
  report_type TEXT NOT NULL CHECK (report_type IN ('gdpr', 'sox', 'custom')),
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  generated_by UUID,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  checksum TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_compliance_brand_period ON public.audit_compliance_reports (brand_id, period_end DESC);
CREATE INDEX idx_audit_compliance_type ON public.audit_compliance_reports (report_type);

ALTER TABLE public.audit_compliance_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit admins can read compliance reports"
  ON public.audit_compliance_reports
  FOR SELECT
  USING (public.is_audit_admin(auth.uid()));

CREATE POLICY "audit admins can insert compliance reports"
  ON public.audit_compliance_reports
  FOR INSERT
  WITH CHECK (public.is_audit_admin(auth.uid()));

CREATE POLICY "audit admins can delete compliance reports"
  ON public.audit_compliance_reports
  FOR DELETE
  USING (public.is_audit_admin(auth.uid()));

-- Generate compliance report RPC
CREATE OR REPLACE FUNCTION public.generate_compliance_report(
  p_brand_id UUID,
  p_report_type TEXT,
  p_period_start TIMESTAMPTZ,
  p_period_end TIMESTAMPTZ,
  p_notes TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_summary JSONB;
  v_total INT;
  v_by_action JSONB;
  v_by_entity JSONB;
  v_top_users JSONB;
  v_exports INT;
  v_deletions INT;
  v_permission_changes INT;
  v_pii_access INT;
  v_anomalies INT;
  v_checksum TEXT;
  v_report_id UUID;
BEGIN
  IF NOT public.is_audit_admin(auth.uid()) THEN
    RAISE EXCEPTION 'access denied';
  END IF;

  IF p_report_type NOT IN ('gdpr', 'sox', 'custom') THEN
    RAISE EXCEPTION 'invalid report_type';
  END IF;

  SELECT id INTO v_user_id FROM public.users WHERE supabase_auth_id = auth.uid() LIMIT 1;

  -- Total events
  SELECT count(*) INTO v_total
  FROM public.audit_events
  WHERE brand_id = p_brand_id
    AND occurred_at >= p_period_start
    AND occurred_at < p_period_end;

  -- By action
  SELECT COALESCE(jsonb_object_agg(action, cnt), '{}'::jsonb) INTO v_by_action
  FROM (
    SELECT action, count(*) AS cnt
    FROM public.audit_events
    WHERE brand_id = p_brand_id
      AND occurred_at >= p_period_start
      AND occurred_at < p_period_end
    GROUP BY action
    ORDER BY cnt DESC
    LIMIT 50
  ) a;

  -- By entity type
  SELECT COALESCE(jsonb_object_agg(entity_type, cnt), '{}'::jsonb) INTO v_by_entity
  FROM (
    SELECT entity_type, count(*) AS cnt
    FROM public.audit_events
    WHERE brand_id = p_brand_id
      AND occurred_at >= p_period_start
      AND occurred_at < p_period_end
    GROUP BY entity_type
    ORDER BY cnt DESC
    LIMIT 50
  ) e;

  -- Top users
  SELECT COALESCE(jsonb_agg(jsonb_build_object('user_id', actor_user_id, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
  INTO v_top_users
  FROM (
    SELECT actor_user_id, count(*) AS cnt
    FROM public.audit_events
    WHERE brand_id = p_brand_id
      AND occurred_at >= p_period_start
      AND occurred_at < p_period_end
      AND actor_user_id IS NOT NULL
    GROUP BY actor_user_id
    ORDER BY cnt DESC
    LIMIT 20
  ) u;

  -- SOX/GDPR critical events
  SELECT count(*) INTO v_exports
  FROM public.audit_events
  WHERE brand_id = p_brand_id
    AND occurred_at >= p_period_start
    AND occurred_at < p_period_end
    AND action IN ('export', 'data_export', 'csv_export');

  SELECT count(*) INTO v_deletions
  FROM public.audit_events
  WHERE brand_id = p_brand_id
    AND occurred_at >= p_period_start
    AND occurred_at < p_period_end
    AND action IN ('delete', 'hard_delete');

  SELECT count(*) INTO v_permission_changes
  FROM public.audit_events
  WHERE brand_id = p_brand_id
    AND occurred_at >= p_period_start
    AND occurred_at < p_period_end
    AND (action ILIKE '%role%' OR action ILIKE '%permission%' OR entity_type IN ('user_roles', 'user_module_access'));

  -- PII access (from audit_access_log if exists)
  v_pii_access := 0;
  BEGIN
    SELECT count(*) INTO v_pii_access
    FROM public.audit_access_log
    WHERE brand_id = p_brand_id
      AND accessed_at >= p_period_start
      AND accessed_at < p_period_end;
  EXCEPTION WHEN OTHERS THEN
    v_pii_access := 0;
  END;

  -- Anomalies count
  v_anomalies := 0;
  BEGIN
    SELECT count(*) INTO v_anomalies
    FROM public.audit_anomalies
    WHERE brand_id = p_brand_id
      AND detected_at >= p_period_start
      AND detected_at < p_period_end;
  EXCEPTION WHEN OTHERS THEN
    v_anomalies := 0;
  END;

  v_summary := jsonb_build_object(
    'total_events', v_total,
    'by_action', v_by_action,
    'by_entity_type', v_by_entity,
    'top_users', v_top_users,
    'critical', jsonb_build_object(
      'exports', v_exports,
      'deletions', v_deletions,
      'permission_changes', v_permission_changes,
      'pii_access', v_pii_access,
      'anomalies', v_anomalies
    ),
    'meta', jsonb_build_object(
      'report_type', p_report_type,
      'period_start', p_period_start,
      'period_end', p_period_end,
      'generated_at', now()
    )
  );

  -- Checksum (deterministic hash of summary)
  v_checksum := encode(digest(v_summary::text || p_brand_id::text || p_period_start::text || p_period_end::text, 'sha256'), 'hex');

  INSERT INTO public.audit_compliance_reports (
    brand_id, report_type, period_start, period_end,
    generated_by, summary, checksum, notes
  ) VALUES (
    p_brand_id, p_report_type, p_period_start, p_period_end,
    v_user_id, v_summary, v_checksum, p_notes
  ) RETURNING id INTO v_report_id;

  RETURN jsonb_build_object(
    'id', v_report_id,
    'checksum', v_checksum,
    'summary', v_summary
  );
END;
$$;

-- List reports RPC
CREATE OR REPLACE FUNCTION public.list_compliance_reports(
  p_brand_id UUID,
  p_report_type TEXT DEFAULT NULL,
  p_limit INT DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_results JSONB;
BEGIN
  IF NOT public.is_audit_admin(auth.uid()) THEN
    RAISE EXCEPTION 'access denied';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', id,
      'report_type', report_type,
      'period_start', period_start,
      'period_end', period_end,
      'generated_at', generated_at,
      'generated_by', generated_by,
      'checksum', checksum,
      'notes', notes,
      'total_events', summary->'total_events'
    )
    ORDER BY generated_at DESC
  ), '[]'::jsonb)
  INTO v_results
  FROM (
    SELECT *
    FROM public.audit_compliance_reports
    WHERE brand_id = p_brand_id
      AND (p_report_type IS NULL OR report_type = p_report_type)
    ORDER BY generated_at DESC
    LIMIT LEAST(p_limit, 200)
  ) r;

  RETURN v_results;
END;
$$;

-- Get single report
CREATE OR REPLACE FUNCTION public.get_compliance_report(p_report_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report public.audit_compliance_reports;
BEGIN
  IF NOT public.is_audit_admin(auth.uid()) THEN
    RAISE EXCEPTION 'access denied';
  END IF;

  SELECT * INTO v_report FROM public.audit_compliance_reports WHERE id = p_report_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'report not found';
  END IF;

  RETURN to_jsonb(v_report);
END;
$$;