
-- Migrate get_callcenter_kpis_overview to accept uuid[] for multi-brand support
CREATE OR REPLACE FUNCTION public.get_callcenter_kpis_overview(
  p_brand_ids uuid[],
  p_from timestamptz,
  p_to timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'tickets_created', COALESCE((
      SELECT count(*) FROM tickets
      WHERE brand_id = ANY(p_brand_ids)
        AND opened_at >= p_from AND opened_at <= p_to
    ), 0),
    'tickets_assigned', COALESCE((
      SELECT count(*) FROM tickets
      WHERE brand_id = ANY(p_brand_ids)
        AND assigned_at >= p_from AND assigned_at <= p_to
    ), 0),
    'tickets_resolved', COALESCE((
      SELECT count(*) FROM tickets
      WHERE brand_id = ANY(p_brand_ids)
        AND resolved_at >= p_from AND resolved_at <= p_to
    ), 0),
    'tickets_closed', COALESCE((
      SELECT count(*) FROM tickets
      WHERE brand_id = ANY(p_brand_ids)
        AND status = 'closed'
        AND updated_at >= p_from AND updated_at <= p_to
    ), 0),
    'avg_time_to_assign_minutes', COALESCE((
      SELECT round(avg(EXTRACT(EPOCH FROM (assigned_at - opened_at)) / 60)::numeric, 1)
      FROM tickets
      WHERE brand_id = ANY(p_brand_ids)
        AND assigned_at IS NOT NULL
        AND opened_at >= p_from AND opened_at <= p_to
    ), 0),
    'avg_time_to_resolve_minutes', COALESCE((
      SELECT round(avg(EXTRACT(EPOCH FROM (resolved_at - opened_at)) / 60)::numeric, 1)
      FROM tickets
      WHERE brand_id = ANY(p_brand_ids)
        AND resolved_at IS NOT NULL
        AND opened_at >= p_from AND opened_at <= p_to
    ), 0),
    'backlog_total', COALESCE((
      SELECT count(*) FROM tickets
      WHERE brand_id = ANY(p_brand_ids)
        AND status IN ('open', 'in_progress', 'reopened')
    ), 0),
    'unassigned_now', COALESCE((
      SELECT count(*) FROM tickets
      WHERE brand_id = ANY(p_brand_ids)
        AND status IN ('open', 'in_progress', 'reopened')
        AND assigned_to_user_id IS NULL
    ), 0),
    'priority_distribution', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('priority', priority, 'count', cnt))
      FROM (
        SELECT priority, count(*)::int as cnt
        FROM tickets
        WHERE brand_id = ANY(p_brand_ids)
          AND status IN ('open', 'in_progress', 'reopened')
        GROUP BY priority
        ORDER BY priority
      ) sub
    ), '[]'::jsonb),
    'status_distribution', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('status', status::text, 'count', cnt))
      FROM (
        SELECT status, count(*)::int as cnt
        FROM tickets
        WHERE brand_id = ANY(p_brand_ids)
          AND opened_at >= p_from AND opened_at <= p_to
        GROUP BY status
        ORDER BY status
      ) sub
    ), '[]'::jsonb),
    'daily_trend', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('date', d, 'created', created_cnt, 'resolved', resolved_cnt))
      FROM (
        SELECT
          d::date::text as d,
          COALESCE((SELECT count(*) FROM tickets WHERE brand_id = ANY(p_brand_ids) AND opened_at::date = d::date), 0)::int as created_cnt,
          COALESCE((SELECT count(*) FROM tickets WHERE brand_id = ANY(p_brand_ids) AND resolved_at::date = d::date), 0)::int as resolved_cnt
        FROM generate_series(p_from::date, p_to::date, '1 day'::interval) d
        ORDER BY d
      ) sub
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

-- Migrate get_callcenter_kpis_by_operator to accept uuid[] for multi-brand support
CREATE OR REPLACE FUNCTION public.get_callcenter_kpis_by_operator(
  p_brand_ids uuid[],
  p_from timestamptz,
  p_to timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb)
  INTO result
  FROM (
    SELECT jsonb_build_object(
      'user_id', u.id,
      'full_name', u.full_name,
      'email', u.email,
      'role', u.role,
      'tickets_assigned', COALESCE((
        SELECT count(*) FROM tickets t
        WHERE t.assigned_to_user_id = u.id
          AND t.brand_id = ANY(p_brand_ids)
          AND t.assigned_at >= p_from AND t.assigned_at <= p_to
      ), 0),
      'tickets_resolved', COALESCE((
        SELECT count(*) FROM tickets t
        WHERE t.assigned_to_user_id = u.id
          AND t.brand_id = ANY(p_brand_ids)
          AND t.resolved_at >= p_from AND t.resolved_at <= p_to
      ), 0),
      'tickets_closed', COALESCE((
        SELECT count(*) FROM tickets t
        WHERE t.assigned_to_user_id = u.id
          AND t.brand_id = ANY(p_brand_ids)
          AND t.status = 'closed'
          AND t.updated_at >= p_from AND t.updated_at <= p_to
      ), 0),
      'avg_time_to_assign_minutes', COALESCE((
        SELECT round(avg(EXTRACT(EPOCH FROM (t.assigned_at - t.opened_at)) / 60)::numeric, 1)
        FROM tickets t
        WHERE t.assigned_to_user_id = u.id
          AND t.brand_id = ANY(p_brand_ids)
          AND t.assigned_at IS NOT NULL
          AND t.opened_at >= p_from AND t.opened_at <= p_to
      ), 0),
      'avg_time_to_resolve_minutes', COALESCE((
        SELECT round(avg(EXTRACT(EPOCH FROM (t.resolved_at - t.opened_at)) / 60)::numeric, 1)
        FROM tickets t
        WHERE t.assigned_to_user_id = u.id
          AND t.brand_id = ANY(p_brand_ids)
          AND t.resolved_at IS NOT NULL
          AND t.opened_at >= p_from AND t.opened_at <= p_to
      ), 0),
      'backlog_current', COALESCE((
        SELECT count(*) FROM tickets t
        WHERE t.assigned_to_user_id = u.id
          AND t.brand_id = ANY(p_brand_ids)
          AND t.status IN ('open', 'in_progress', 'reopened')
      ), 0)
    ) as row_data
    FROM users u
    WHERE u.role IN ('operatore_callcenter', 'responsabile_callcenter', 'callcenter', 'admin')
      AND EXISTS (
        SELECT 1 FROM user_brand_assignments uba
        WHERE uba.user_id = u.id
          AND uba.brand_id = ANY(p_brand_ids)
      )
    ORDER BY u.full_name NULLS LAST
  ) sub;

  RETURN result;
END;
$$;

-- Drop old single-uuid versions to avoid ambiguity
DROP FUNCTION IF EXISTS public.get_callcenter_kpis_overview(uuid, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.get_callcenter_kpis_by_operator(uuid, timestamptz, timestamptz);
