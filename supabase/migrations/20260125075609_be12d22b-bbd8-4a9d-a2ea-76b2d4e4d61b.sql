-- RPC function for ticket trend dashboard
-- Returns: daily trend, backlog over time, top categories, aging buckets, operator breakdown

CREATE OR REPLACE FUNCTION public.get_ticket_trend_dashboard(
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
    -- Daily trend: created vs resolved
    'daily_trend', (
      SELECT COALESCE(json_agg(json_build_object(
        'date', day::date,
        'created', created_cnt,
        'resolved', resolved_cnt,
        'closed', closed_cnt
      ) ORDER BY day), '[]'::json)
      FROM (
        SELECT 
          date_trunc('day', opened_at) as day,
          COUNT(*) as created_cnt,
          COUNT(*) FILTER (WHERE resolved_at IS NOT NULL AND resolved_at >= p_from AND resolved_at < p_to) as resolved_cnt,
          COUNT(*) FILTER (WHERE closed_at IS NOT NULL AND closed_at >= p_from AND closed_at < p_to) as closed_cnt
        FROM tickets
        WHERE brand_id = p_brand_id
          AND opened_at >= p_from
          AND opened_at < p_to
        GROUP BY date_trunc('day', opened_at)
      ) t
    ),
    
    -- Backlog over time (cumulative open tickets per day)
    'backlog_trend', (
      SELECT COALESCE(json_agg(json_build_object(
        'date', day::date,
        'backlog', backlog_cnt
      ) ORDER BY day), '[]'::json)
      FROM (
        SELECT 
          d.day,
          (
            SELECT COUNT(*) 
            FROM tickets t 
            WHERE t.brand_id = p_brand_id
              AND t.opened_at <= d.day + interval '1 day'
              AND (t.closed_at IS NULL OR t.closed_at > d.day + interval '1 day')
              AND t.status IN ('open', 'in_progress', 'reopened')
          ) as backlog_cnt
        FROM generate_series(p_from::date, p_to::date, '1 day'::interval) as d(day)
      ) t
    ),
    
    -- Top categories (by tag)
    'top_categories', (
      SELECT COALESCE(json_agg(json_build_object(
        'tag_id', tag_id,
        'tag_name', tag_name,
        'tag_color', tag_color,
        'count', cnt
      ) ORDER BY cnt DESC), '[]'::json)
      FROM (
        SELECT 
          t.category_tag_id as tag_id,
          COALESCE(tg.name, 'Non categorizzato') as tag_name,
          COALESCE(tg.color, '#6b7280') as tag_color,
          COUNT(*) as cnt
        FROM tickets t
        LEFT JOIN tags tg ON tg.id = t.category_tag_id
        WHERE t.brand_id = p_brand_id
          AND t.opened_at >= p_from
          AND t.opened_at < p_to
        GROUP BY t.category_tag_id, tg.name, tg.color
        LIMIT 10
      ) t
    ),
    
    -- Aging buckets for open tickets (current state)
    'aging_buckets', (
      SELECT json_build_object(
        'bucket_0_1h', COUNT(*) FILTER (WHERE age_minutes <= 60),
        'bucket_1_4h', COUNT(*) FILTER (WHERE age_minutes > 60 AND age_minutes <= 240),
        'bucket_4_24h', COUNT(*) FILTER (WHERE age_minutes > 240 AND age_minutes <= 1440),
        'bucket_over_24h', COUNT(*) FILTER (WHERE age_minutes > 1440)
      )
      FROM (
        SELECT EXTRACT(EPOCH FROM (now() - opened_at)) / 60 as age_minutes
        FROM tickets
        WHERE brand_id = p_brand_id
          AND status IN ('open', 'in_progress', 'reopened')
      ) t
    ),
    
    -- Operator breakdown
    'operator_breakdown', (
      SELECT COALESCE(json_agg(json_build_object(
        'user_id', user_id,
        'full_name', full_name,
        'email', email,
        'assigned_count', assigned_cnt,
        'resolved_count', resolved_cnt,
        'avg_resolution_minutes', avg_res_min,
        'current_backlog', backlog_cnt
      ) ORDER BY assigned_cnt DESC), '[]'::json)
      FROM (
        SELECT 
          u.id as user_id,
          u.full_name,
          u.email,
          (
            SELECT COUNT(*)
            FROM tickets t
            WHERE t.brand_id = p_brand_id
              AND t.assigned_to_user_id = u.id
              AND t.assigned_at >= p_from
              AND t.assigned_at < p_to
          ) as assigned_cnt,
          (
            SELECT COUNT(*)
            FROM tickets t
            WHERE t.brand_id = p_brand_id
              AND t.assigned_to_user_id = u.id
              AND t.resolved_at >= p_from
              AND t.resolved_at < p_to
          ) as resolved_cnt,
          (
            SELECT COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (t.resolved_at - t.assigned_at)) / 60)::numeric, 1), 0)
            FROM tickets t
            WHERE t.brand_id = p_brand_id
              AND t.assigned_to_user_id = u.id
              AND t.resolved_at >= p_from
              AND t.resolved_at < p_to
              AND t.assigned_at IS NOT NULL
          ) as avg_res_min,
          (
            SELECT COUNT(*)
            FROM tickets t
            WHERE t.brand_id = p_brand_id
              AND t.assigned_to_user_id = u.id
              AND t.status IN ('open', 'in_progress', 'reopened')
          ) as backlog_cnt
        FROM users u
        JOIN user_roles ur ON ur.user_id = u.id
        WHERE ur.brand_id = p_brand_id
          AND ur.role IN ('callcenter', 'admin')
      ) t
    ),
    
    -- Summary totals
    'summary', (
      SELECT json_build_object(
        'total_created', COUNT(*) FILTER (WHERE opened_at >= p_from AND opened_at < p_to),
        'total_resolved', COUNT(*) FILTER (WHERE resolved_at >= p_from AND resolved_at < p_to),
        'total_closed', COUNT(*) FILTER (WHERE closed_at >= p_from AND closed_at < p_to),
        'current_backlog', COUNT(*) FILTER (WHERE status IN ('open', 'in_progress', 'reopened')),
        'current_unassigned', COUNT(*) FILTER (WHERE status IN ('open', 'in_progress', 'reopened') AND assigned_to_user_id IS NULL)
      )
      FROM tickets
      WHERE brand_id = p_brand_id
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$function$;