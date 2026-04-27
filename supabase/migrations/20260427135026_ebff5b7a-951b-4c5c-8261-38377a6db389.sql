-- 1. Audit-of-audit table
CREATE TABLE IF NOT EXISTS public.audit_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid,
  accessed_by uuid NOT NULL,
  accessed_by_display_name text,
  access_type text NOT NULL,
  filters jsonb DEFAULT '{}'::jsonb,
  result_count integer,
  reason text,
  ip_hash text,
  user_agent text,
  accessed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_access_log_user ON public.audit_access_log (accessed_by, accessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_access_log_brand ON public.audit_access_log (brand_id, accessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_access_log_type ON public.audit_access_log (access_type, accessed_at DESC);

ALTER TABLE public.audit_access_log ENABLE ROW LEVEL SECURITY;

-- 2. Permission helper for audit access — uses user_roles via has_role
CREATE OR REPLACE FUNCTION public.can_view_audit(_supabase_auth_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.users u ON u.id = ur.user_id
    WHERE u.supabase_auth_id = _supabase_auth_id
      AND ur.role IN ('admin'::app_role, 'ceo'::app_role, 'amministrazione'::app_role, 'responsabile_venditori'::app_role, 'responsabile_callcenter'::app_role)
  );
$$;

-- 3. Helper for admin-only (audit access log viewers)
CREATE OR REPLACE FUNCTION public.is_audit_admin(_supabase_auth_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.users u ON u.id = ur.user_id
    WHERE u.supabase_auth_id = _supabase_auth_id
      AND ur.role IN ('admin'::app_role, 'ceo'::app_role)
  );
$$;

-- 4. RLS for audit_access_log
DROP POLICY IF EXISTS "audit_access_log_select_admin" ON public.audit_access_log;
CREATE POLICY "audit_access_log_select_admin"
  ON public.audit_access_log FOR SELECT TO authenticated
  USING (public.is_audit_admin(auth.uid()));

DROP POLICY IF EXISTS "audit_access_log_insert_self" ON public.audit_access_log;
CREATE POLICY "audit_access_log_insert_self"
  ON public.audit_access_log FOR INSERT TO authenticated
  WITH CHECK (accessed_by = public.get_user_id(auth.uid()));

-- 5. Tighten audit_events SELECT policy
DROP POLICY IF EXISTS "audit_events_select_brand_members" ON public.audit_events;
DROP POLICY IF EXISTS "audit_events_select_audit_viewers" ON public.audit_events;
CREATE POLICY "audit_events_select_audit_viewers"
  ON public.audit_events FOR SELECT TO authenticated
  USING (
    public.user_belongs_to_brand(public.get_user_id(auth.uid()), brand_id)
    AND public.can_view_audit(auth.uid())
  );

-- 6. Log audit access RPC
CREATE OR REPLACE FUNCTION public.log_audit_access(
  p_brand_id uuid,
  p_access_type text,
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_result_count integer DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_display_name text;
  v_id uuid;
BEGIN
  v_user_id := public.get_user_id(auth.uid());
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(full_name, email) INTO v_display_name
  FROM public.users WHERE id = v_user_id;

  INSERT INTO public.audit_access_log (
    brand_id, accessed_by, accessed_by_display_name,
    access_type, filters, result_count, reason, user_agent
  ) VALUES (
    p_brand_id, v_user_id, v_display_name,
    p_access_type, COALESCE(p_filters, '{}'::jsonb),
    p_result_count, p_reason, p_user_agent
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- 7. Dashboard stats RPC
CREATE OR REPLACE FUNCTION public.get_audit_dashboard_stats(
  p_brand_id uuid,
  p_date_from timestamptz DEFAULT (now() - interval '30 days'),
  p_date_to timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total bigint;
  v_by_action jsonb;
  v_by_entity jsonb;
  v_by_actor jsonb;
  v_by_day jsonb;
BEGIN
  IF NOT public.can_view_audit(auth.uid()) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  SELECT count(*) INTO v_total
  FROM public.audit_events
  WHERE brand_id = p_brand_id
    AND occurred_at BETWEEN p_date_from AND p_date_to;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('action', action, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
  INTO v_by_action
  FROM (
    SELECT action, count(*)::bigint as cnt
    FROM public.audit_events
    WHERE brand_id = p_brand_id AND occurred_at BETWEEN p_date_from AND p_date_to
    GROUP BY action
    ORDER BY cnt DESC LIMIT 15
  ) s;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('entity_type', entity_type, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
  INTO v_by_entity
  FROM (
    SELECT entity_type, count(*)::bigint as cnt
    FROM public.audit_events
    WHERE brand_id = p_brand_id AND occurred_at BETWEEN p_date_from AND p_date_to
    GROUP BY entity_type
    ORDER BY cnt DESC
  ) s;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'actor_user_id', actor_user_id,
    'actor_display_name', actor_display_name,
    'count', cnt
  ) ORDER BY cnt DESC), '[]'::jsonb)
  INTO v_by_actor
  FROM (
    SELECT actor_user_id, actor_display_name, count(*)::bigint as cnt
    FROM public.audit_events
    WHERE brand_id = p_brand_id AND occurred_at BETWEEN p_date_from AND p_date_to
      AND actor_user_id IS NOT NULL
    GROUP BY actor_user_id, actor_display_name
    ORDER BY cnt DESC LIMIT 20
  ) s;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('day', day, 'count', cnt) ORDER BY day), '[]'::jsonb)
  INTO v_by_day
  FROM (
    SELECT date_trunc('day', occurred_at)::date as day, count(*)::bigint as cnt
    FROM public.audit_events
    WHERE brand_id = p_brand_id AND occurred_at BETWEEN p_date_from AND p_date_to
    GROUP BY day
    ORDER BY day
  ) s;

  RETURN jsonb_build_object(
    'total', v_total,
    'by_action', v_by_action,
    'by_entity', v_by_entity,
    'by_actor', v_by_actor,
    'by_day', v_by_day
  );
END;
$$;

-- 8. Anomaly detection RPC
CREATE OR REPLACE FUNCTION public.detect_audit_anomalies(
  p_brand_id uuid,
  p_lookback_hours integer DEFAULT 24
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since timestamptz;
  v_mass_export jsonb;
  v_mass_delete jsonb;
  v_off_hours jsonb;
BEGIN
  IF NOT public.can_view_audit(auth.uid()) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  v_since := now() - (p_lookback_hours || ' hours')::interval;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'accessed_by', accessed_by,
    'accessed_by_display_name', accessed_by_display_name,
    'result_count', result_count,
    'accessed_at', accessed_at,
    'access_type', access_type
  ) ORDER BY accessed_at DESC), '[]'::jsonb)
  INTO v_mass_export
  FROM (
    SELECT * FROM public.audit_access_log
    WHERE (brand_id = p_brand_id OR brand_id IS NULL)
      AND accessed_at >= v_since
      AND access_type = 'export'
      AND COALESCE(result_count, 0) > 500
    LIMIT 50
  ) s;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'actor_user_id', actor_user_id,
    'actor_display_name', actor_display_name,
    'delete_count', cnt,
    'window_start', window_start
  ) ORDER BY cnt DESC), '[]'::jsonb)
  INTO v_mass_delete
  FROM (
    SELECT
      actor_user_id,
      max(actor_display_name) AS actor_display_name,
      date_trunc('hour', occurred_at) AS window_start,
      count(*)::bigint AS cnt
    FROM public.audit_events
    WHERE brand_id = p_brand_id
      AND occurred_at >= v_since
      AND action = 'delete'
      AND actor_user_id IS NOT NULL
    GROUP BY actor_user_id, date_trunc('hour', occurred_at)
    HAVING count(*) > 20
    LIMIT 50
  ) s;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'actor_user_id', actor_user_id,
    'actor_display_name', actor_display_name,
    'action_count', cnt,
    'sample_at', sample_at
  ) ORDER BY cnt DESC), '[]'::jsonb)
  INTO v_off_hours
  FROM (
    SELECT
      actor_user_id,
      max(actor_display_name) AS actor_display_name,
      count(*)::bigint AS cnt,
      max(occurred_at) AS sample_at
    FROM public.audit_events
    WHERE brand_id = p_brand_id
      AND occurred_at >= v_since
      AND extract(hour from occurred_at) BETWEEN 0 AND 5
      AND actor_user_id IS NOT NULL
      AND actor_type = 'user'
    GROUP BY actor_user_id
    HAVING count(*) >= 5
    LIMIT 50
  ) s;

  RETURN jsonb_build_object(
    'lookback_hours', p_lookback_hours,
    'generated_at', now(),
    'mass_export', v_mass_export,
    'mass_delete', v_mass_delete,
    'off_hours', v_off_hours
  );
END;
$$;

-- 9. Unified customer timeline RPC
CREATE OR REPLACE FUNCTION public.get_unified_customer_timeline(
  p_contact_id uuid,
  p_limit integer DEFAULT 200
)
RETURNS TABLE (
  source text,
  event_id uuid,
  occurred_at timestamptz,
  actor_display_name text,
  action text,
  entity_type text,
  entity_id uuid,
  summary text,
  metadata jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand_id uuid;
BEGIN
  SELECT brand_id INTO v_brand_id FROM public.contacts WHERE id = p_contact_id;
  IF v_brand_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT public.user_belongs_to_brand(public.get_user_id(auth.uid()), v_brand_id) THEN
    RAISE EXCEPTION 'Not authorized for this contact';
  END IF;

  RETURN QUERY
  SELECT
    'audit'::text AS source,
    ae.id AS event_id,
    ae.occurred_at,
    ae.actor_display_name,
    ae.action,
    ae.entity_type,
    ae.entity_id,
    NULL::text AS summary,
    ae.metadata
  FROM public.audit_events ae
  WHERE ae.entity_type = 'contact' AND ae.entity_id = p_contact_id

  UNION ALL
  SELECT
    'audit'::text, ae.id, ae.occurred_at, ae.actor_display_name,
    ae.action, ae.entity_type, ae.entity_id, NULL::text, ae.metadata
  FROM public.audit_events ae
  JOIN public.deals d ON d.id = ae.entity_id
  WHERE ae.entity_type = 'deal' AND d.contact_id = p_contact_id

  UNION ALL
  SELECT
    'audit'::text, ae.id, ae.occurred_at, ae.actor_display_name,
    ae.action, ae.entity_type, ae.entity_id, NULL::text, ae.metadata
  FROM public.audit_events ae
  JOIN public.tickets t ON t.id = ae.entity_id
  WHERE ae.entity_type = 'ticket' AND t.contact_id = p_contact_id

  UNION ALL
  SELECT
    'audit'::text, ae.id, ae.occurred_at, ae.actor_display_name,
    ae.action, ae.entity_type, ae.entity_id, NULL::text, ae.metadata
  FROM public.audit_events ae
  JOIN public.appointments a ON a.id = ae.entity_id
  WHERE ae.entity_type = 'appointment' AND a.contact_id = p_contact_id

  ORDER BY occurred_at DESC
  LIMIT p_limit;
END;
$$;

-- 10. Grants
GRANT EXECUTE ON FUNCTION public.log_audit_access(uuid, text, jsonb, integer, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_audit_dashboard_stats(uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.detect_audit_anomalies(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_unified_customer_timeline(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_audit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_audit_admin(uuid) TO authenticated;