
-- C9: Admin RPC hardening — require admin/ceo role for sensitive RPCs.
-- Pattern: allow service-role/cron (auth.uid() IS NULL) to bypass; otherwise enforce role.

-- 1) Lock down secret/identity disclosure RPCs (service role only)
REVOKE EXECUTE ON FUNCTION public.get_cron_secret() FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.get_auth_user_id_by_email(text) FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.reset_auth_rate_limit(text, text) FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.record_audit_anomaly(uuid, text, text, text, text, uuid, jsonb) FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.set_audit_context(uuid, text, text, text, text, text) FROM PUBLIC, authenticated, anon;

-- 2) Add admin/ceo guards (allow service-role bypass when auth.uid() IS NULL)

CREATE OR REPLACE FUNCTION public.activate_ai_prompt(p_prompt_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_prompt public.ai_prompts;
  v_uid uuid := public.get_user_id(auth.uid());
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (
    public.has_role(v_uid, 'admin'::app_role) OR public.has_role(v_uid, 'ceo'::app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_prompt FROM public.ai_prompts WHERE id = p_prompt_id;
  IF NOT FOUND THEN RETURN false; END IF;

  UPDATE public.ai_prompts SET is_active = false
   WHERE brand_id = v_prompt.brand_id AND name = v_prompt.name;
  UPDATE public.ai_prompts SET is_active = true WHERE id = p_prompt_id;
  UPDATE public.ai_configs
     SET active_prompt_version = v_prompt.version, updated_at = now()
   WHERE brand_id = v_prompt.brand_id;
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.apply_ai_deal_tags(p_deal_id uuid, p_tag_ids uuid[], p_confidence double precision DEFAULT 0.8)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_brand_id UUID;
  v_tag_id UUID;
  v_count INTEGER := 0;
  v_uid uuid := public.get_user_id(auth.uid());
BEGIN
  SELECT brand_id INTO v_brand_id FROM deals WHERE id = p_deal_id;
  IF v_brand_id IS NULL THEN RAISE EXCEPTION 'Deal not found: %', p_deal_id; END IF;

  -- Authenticated callers must have brand access (admin/ceo or any role on the brand).
  -- Service role / triggers (auth.uid() IS NULL) bypass.
  IF auth.uid() IS NOT NULL AND NOT (
    public.has_role(v_uid, 'admin'::app_role)
    OR public.has_role(v_uid, 'ceo'::app_role)
    OR public.user_can_access_brand(v_uid, v_brand_id)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  FOREACH v_tag_id IN ARRAY p_tag_ids LOOP
    INSERT INTO tag_assignments (brand_id, tag_id, deal_id, assigned_by, confidence)
    VALUES (v_brand_id, v_tag_id, p_deal_id, 'ai', p_confidence)
    ON CONFLICT (tag_id, deal_id) WHERE deal_id IS NOT NULL DO NOTHING;
    IF FOUND THEN v_count := v_count + 1; END IF;
  END LOOP;
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.apply_ai_fallback(p_lead_event_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_brand_id UUID;
  v_fallback_tag_id UUID;
  v_uid uuid := public.get_user_id(auth.uid());
BEGIN
  SELECT brand_id INTO v_brand_id FROM lead_events WHERE id = p_lead_event_id;
  IF v_brand_id IS NULL THEN RETURN; END IF;

  IF auth.uid() IS NOT NULL AND NOT (
    public.has_role(v_uid, 'admin'::app_role)
    OR public.has_role(v_uid, 'ceo'::app_role)
    OR public.user_can_access_brand(v_uid, v_brand_id)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE lead_events SET
    lead_type = 'generic',
    ai_priority = 3,
    ai_confidence = 0.0,
    ai_rationale = 'Fallback: AI processing not available',
    ai_processed = true,
    ai_processed_at = now()
  WHERE id = p_lead_event_id;

  SELECT id INTO v_fallback_tag_id
  FROM tags
  WHERE brand_id = v_brand_id AND name = 'Da Verificare' AND parent_id IS NULL
  LIMIT 1;

  IF v_fallback_tag_id IS NULL THEN
    INSERT INTO tags (brand_id, name, color, scope, description)
    VALUES (v_brand_id, 'Da Verificare', '#f59e0b', 'mixed', 'Tag automatico per lead non classificati')
    RETURNING id INTO v_fallback_tag_id;
  END IF;

  INSERT INTO tag_assignments (brand_id, tag_id, lead_event_id, assigned_by, confidence)
  VALUES (v_brand_id, v_fallback_tag_id, p_lead_event_id, 'ai', 0.0)
  ON CONFLICT DO NOTHING;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rebuild_contact_search_index()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count INTEGER := 0;
  v_uid uuid := public.get_user_id(auth.uid());
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (
    public.has_role(v_uid, 'admin'::app_role) OR public.has_role(v_uid, 'ceo'::app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  DELETE FROM contact_search_index;
  INSERT INTO contact_search_index (contact_id, brand_id, search_text, search_vector, updated_at)
  SELECT c.id, c.brand_id,
         public.build_contact_search_text(c.id),
         to_tsvector('simple', public.build_contact_search_text(c.id)),
         now()
  FROM contacts c;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assign_unassigned_support_tickets(p_brand_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ticket RECORD;
  v_assigned_count integer := 0;
  v_auto_assign_enabled boolean;
  v_uid uuid := public.get_user_id(auth.uid());
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (
    public.has_role(v_uid, 'admin'::app_role)
    OR public.has_role(v_uid, 'ceo'::app_role)
    OR public.has_role_for_brand(v_uid, p_brand_id, 'admin'::app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT auto_assign_enabled INTO v_auto_assign_enabled FROM brands WHERE id = p_brand_id;
  IF v_auto_assign_enabled IS NOT TRUE THEN RETURN 0; END IF;

  FOR v_ticket IN
    SELECT t.id FROM tickets t
    JOIN lead_events le ON le.id = t.source_event_id
    WHERE t.brand_id = p_brand_id
      AND t.assigned_to_user_id IS NULL
      AND t.status IN ('open', 'reopened')
      AND le.should_create_ticket = true
    ORDER BY t.created_at ASC
  LOOP
    IF assign_ticket_round_robin(v_ticket.id, p_brand_id) IS NOT NULL THEN
      v_assigned_count := v_assigned_count + 1;
    END IF;
  END LOOP;
  RETURN v_assigned_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.escalate_all_brands_breached_tickets()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_brand RECORD;
  v_brand_result jsonb;
  v_total integer := 0;
  v_results jsonb := '[]'::jsonb;
  v_uid uuid := public.get_user_id(auth.uid());
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (
    public.has_role(v_uid, 'admin'::app_role) OR public.has_role(v_uid, 'ceo'::app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  FOR v_brand IN SELECT id, name FROM brands LIMIT 500 LOOP
    v_brand_result := escalate_breached_tickets(v_brand.id);
    IF (v_brand_result->>'escalated_count')::int > 0 THEN
      v_total := v_total + (v_brand_result->>'escalated_count')::int;
      v_results := v_results || jsonb_build_object(
        'brand_id', v_brand.id, 'brand_name', v_brand.name,
        'escalated_count', v_brand_result->>'escalated_count'
      );
    END IF;
  END LOOP;
  RETURN jsonb_build_object('total_escalated', v_total, 'brands', v_results);
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_all_brands_sla_breaches()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_brand RECORD;
  v_total_breached integer := 0;
  v_brand_results jsonb := '[]'::jsonb;
  v_count integer;
  v_uid uuid := public.get_user_id(auth.uid());
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (
    public.has_role(v_uid, 'admin'::app_role) OR public.has_role(v_uid, 'ceo'::app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  FOR v_brand IN SELECT id, name FROM brands LOOP
    SELECT check_and_mark_sla_breaches(v_brand.id) INTO v_count;
    IF v_count > 0 THEN
      v_total_breached := v_total_breached + v_count;
      v_brand_results := v_brand_results || jsonb_build_object(
        'brand_id', v_brand.id, 'brand_name', v_brand.name, 'breached_count', v_count
      );
    END IF;
  END LOOP;
  RETURN json_build_object('total_breached', v_total_breached, 'brands', v_brand_results);
END;
$function$;

CREATE OR REPLACE FUNCTION public.capture_capacity_snapshot()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_db_size_mb numeric;
  v_contacts_count bigint;
  v_webhooks_today bigint;
  v_audit_today bigint;
  v_failed_jobs bigint;
  v_uid uuid := public.get_user_id(auth.uid());
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (
    public.has_role(v_uid, 'admin'::app_role) OR public.has_role(v_uid, 'ceo'::app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

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
    'webhooks_today', v_webhooks_today,
    'audit_today', v_audit_today,
    'failed_jobs', v_failed_jobs
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_anomaly_baselines()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count int := 0;
  v_uid uuid := public.get_user_id(auth.uid());
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (
    public.has_role(v_uid, 'admin'::app_role) OR public.has_role(v_uid, 'ceo'::app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

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
$function$;

CREATE OR REPLACE FUNCTION public.detect_anomalies(p_lookback_hours integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_metric record;
  v_observed numeric;
  v_z numeric;
  v_severity text;
  v_direction text;
  v_count int := 0;
  v_uid uuid := public.get_user_id(auth.uid());
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (
    public.has_role(v_uid, 'admin'::app_role) OR public.has_role(v_uid, 'ceo'::app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

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

    v_severity := CASE WHEN abs(v_z) >= 4 THEN 'critical' WHEN abs(v_z) >= 3 THEN 'high' ELSE 'medium' END;
    v_direction := CASE WHEN v_z > 0 THEN 'spike' ELSE 'drop' END;

    INSERT INTO public.anomaly_detections (metric_name, observed_value, expected_value, z_score, severity, direction)
    VALUES (v_metric.metric_name, v_observed, v_metric.mean_value, v_z, v_severity, v_direction);
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('anomalies_detected', v_count);
END;
$function$;
