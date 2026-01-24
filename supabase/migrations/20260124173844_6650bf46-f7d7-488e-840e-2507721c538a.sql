-- Add recommended indexes for KPI queries
CREATE INDEX IF NOT EXISTS idx_tickets_brand_status_opened ON tickets(brand_id, status, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_brand_assigned_user ON tickets(brand_id, assigned_to_user_id, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_brand_resolved ON tickets(brand_id, resolved_at DESC);

-- RPC 1: Overview KPIs for the call center
CREATE OR REPLACE FUNCTION public.get_callcenter_kpis_overview(
  p_brand_id uuid,
  p_from timestamp with time zone,
  p_to timestamp with time zone
)
RETURNS json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_build_object(
    -- Volume metrics for the period
    'tickets_created', (
      SELECT COUNT(*)
      FROM tickets
      WHERE brand_id = p_brand_id
        AND opened_at >= p_from
        AND opened_at < p_to
    ),
    'tickets_assigned', (
      SELECT COUNT(*)
      FROM tickets
      WHERE brand_id = p_brand_id
        AND assigned_at >= p_from
        AND assigned_at < p_to
    ),
    'tickets_resolved', (
      SELECT COUNT(*)
      FROM tickets
      WHERE brand_id = p_brand_id
        AND resolved_at >= p_from
        AND resolved_at < p_to
    ),
    'tickets_closed', (
      SELECT COUNT(*)
      FROM tickets
      WHERE brand_id = p_brand_id
        AND closed_at >= p_from
        AND closed_at < p_to
    ),
    -- SLA timing metrics (in minutes)
    'avg_time_to_assign_minutes', (
      SELECT COALESCE(
        ROUND(AVG(EXTRACT(EPOCH FROM (assigned_at - opened_at)) / 60)::numeric, 1),
        0
      )
      FROM tickets
      WHERE brand_id = p_brand_id
        AND assigned_at IS NOT NULL
        AND assigned_at >= p_from
        AND assigned_at < p_to
    ),
    'avg_time_to_resolve_minutes', (
      SELECT COALESCE(
        ROUND(AVG(EXTRACT(EPOCH FROM (resolved_at - assigned_at)) / 60)::numeric, 1),
        0
      )
      FROM tickets
      WHERE brand_id = p_brand_id
        AND resolved_at IS NOT NULL
        AND assigned_at IS NOT NULL
        AND resolved_at >= p_from
        AND resolved_at < p_to
    ),
    -- Current backlog (not filtered by period)
    'backlog_total', (
      SELECT COUNT(*)
      FROM tickets
      WHERE brand_id = p_brand_id
        AND status IN ('open', 'in_progress', 'reopened')
    ),
    'unassigned_now', (
      SELECT COUNT(*)
      FROM tickets
      WHERE brand_id = p_brand_id
        AND status IN ('open', 'in_progress', 'reopened')
        AND assigned_to_user_id IS NULL
    ),
    -- Priority distribution in period
    'priority_distribution', (
      SELECT COALESCE(json_agg(json_build_object('priority', priority, 'count', cnt)), '[]'::json)
      FROM (
        SELECT priority, COUNT(*) as cnt
        FROM tickets
        WHERE brand_id = p_brand_id
          AND opened_at >= p_from
          AND opened_at < p_to
        GROUP BY priority
        ORDER BY priority
      ) t
    ),
    -- Status distribution in period
    'status_distribution', (
      SELECT COALESCE(json_agg(json_build_object('status', status, 'count', cnt)), '[]'::json)
      FROM (
        SELECT status::text, COUNT(*) as cnt
        FROM tickets
        WHERE brand_id = p_brand_id
          AND opened_at >= p_from
          AND opened_at < p_to
        GROUP BY status
      ) t
    ),
    -- Daily trend
    'daily_trend', (
      SELECT COALESCE(json_agg(json_build_object(
        'date', day::date,
        'created', created_cnt,
        'resolved', resolved_cnt
      ) ORDER BY day), '[]'::json)
      FROM (
        SELECT 
          date_trunc('day', opened_at) as day,
          COUNT(*) as created_cnt,
          COUNT(*) FILTER (WHERE resolved_at IS NOT NULL) as resolved_cnt
        FROM tickets
        WHERE brand_id = p_brand_id
          AND opened_at >= p_from
          AND opened_at < p_to
        GROUP BY date_trunc('day', opened_at)
      ) t
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$function$;

-- RPC 2: KPIs by operator
CREATE OR REPLACE FUNCTION public.get_callcenter_kpis_by_operator(
  p_brand_id uuid,
  p_from timestamp with time zone,
  p_to timestamp with time zone
)
RETURNS json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN (
    SELECT COALESCE(json_agg(row_to_json(op_stats)), '[]'::json)
    FROM (
      SELECT 
        u.id as user_id,
        u.full_name,
        u.email,
        ur.role::text as role,
        -- Tickets assigned to this operator in period
        (
          SELECT COUNT(*)
          FROM tickets t
          WHERE t.brand_id = p_brand_id
            AND t.assigned_to_user_id = u.id
            AND t.assigned_at >= p_from
            AND t.assigned_at < p_to
        ) as tickets_assigned,
        -- Tickets resolved by this operator in period
        (
          SELECT COUNT(*)
          FROM tickets t
          WHERE t.brand_id = p_brand_id
            AND t.assigned_to_user_id = u.id
            AND t.resolved_at >= p_from
            AND t.resolved_at < p_to
        ) as tickets_resolved,
        -- Tickets closed by this operator in period
        (
          SELECT COUNT(*)
          FROM tickets t
          WHERE t.brand_id = p_brand_id
            AND t.assigned_to_user_id = u.id
            AND t.closed_at >= p_from
            AND t.closed_at < p_to
        ) as tickets_closed,
        -- Avg time to assign (for tickets they were assigned in period)
        (
          SELECT COALESCE(
            ROUND(AVG(EXTRACT(EPOCH FROM (t.assigned_at - t.opened_at)) / 60)::numeric, 1),
            0
          )
          FROM tickets t
          WHERE t.brand_id = p_brand_id
            AND t.assigned_to_user_id = u.id
            AND t.assigned_at >= p_from
            AND t.assigned_at < p_to
        ) as avg_time_to_assign_minutes,
        -- Avg time to resolve (for tickets they resolved in period)
        (
          SELECT COALESCE(
            ROUND(AVG(EXTRACT(EPOCH FROM (t.resolved_at - t.assigned_at)) / 60)::numeric, 1),
            0
          )
          FROM tickets t
          WHERE t.brand_id = p_brand_id
            AND t.assigned_to_user_id = u.id
            AND t.resolved_at >= p_from
            AND t.resolved_at < p_to
            AND t.assigned_at IS NOT NULL
        ) as avg_time_to_resolve_minutes,
        -- Current backlog for this operator
        (
          SELECT COUNT(*)
          FROM tickets t
          WHERE t.brand_id = p_brand_id
            AND t.assigned_to_user_id = u.id
            AND t.status IN ('open', 'in_progress', 'reopened')
        ) as backlog_current
      FROM users u
      JOIN user_roles ur ON ur.user_id = u.id
      WHERE ur.brand_id = p_brand_id
        AND ur.role IN ('callcenter', 'sales')
      ORDER BY u.full_name
    ) op_stats
  );
END;
$function$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_callcenter_kpis_overview(uuid, timestamp with time zone, timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_callcenter_kpis_by_operator(uuid, timestamp with time zone, timestamp with time zone) TO authenticated;