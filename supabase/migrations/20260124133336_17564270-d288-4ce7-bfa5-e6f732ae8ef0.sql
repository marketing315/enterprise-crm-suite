-- M5.1: AI Metrics RPC Functions
-- M5.2: Ticket Assignment Enhancement

-- Add assignment tracking fields to tickets
ALTER TABLE public.tickets 
ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS assigned_by_user_id UUID REFERENCES public.users(id);

-- Create index for assignment queries
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to ON public.tickets(brand_id, assigned_to_user_id, status);

-- RPC: Get AI Metrics Overview
CREATE OR REPLACE FUNCTION public.get_ai_metrics_overview(
  p_brand_id UUID,
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'job_counts', (
      SELECT json_build_object(
        'pending', COUNT(*) FILTER (WHERE status = 'pending'),
        'processing', COUNT(*) FILTER (WHERE status = 'processing'),
        'completed', COUNT(*) FILTER (WHERE status = 'completed'),
        'failed', COUNT(*) FILTER (WHERE status = 'failed'),
        'total', COUNT(*)
      )
      FROM ai_jobs
      WHERE brand_id = p_brand_id
        AND created_at >= p_from
        AND created_at < p_to
    ),
    'latency', (
      SELECT json_build_object(
        'avg_ms', COALESCE(
          ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) * 1000)::numeric, 0),
          0
        ),
        'p95_ms', COALESCE(
          ROUND((percentile_cont(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (completed_at - created_at)) * 1000))::numeric, 0),
          0
        ),
        'avg_attempts', COALESCE(ROUND(AVG(attempts)::numeric, 2), 0)
      )
      FROM ai_jobs
      WHERE brand_id = p_brand_id
        AND status = 'completed'
        AND created_at >= p_from
        AND created_at < p_to
    ),
    'fallback_count', (
      SELECT COUNT(*)
      FROM lead_events
      WHERE brand_id = p_brand_id
        AND ai_processed = true
        AND ai_confidence = 0
        AND created_at >= p_from
        AND created_at < p_to
    ),
    'lead_type_distribution', (
      SELECT COALESCE(json_agg(json_build_object('type', lead_type, 'count', cnt)), '[]'::json)
      FROM (
        SELECT lead_type, COUNT(*) as cnt
        FROM lead_events
        WHERE brand_id = p_brand_id
          AND ai_processed = true
          AND created_at >= p_from
          AND created_at < p_to
        GROUP BY lead_type
      ) t
    ),
    'priority_distribution', (
      SELECT COALESCE(json_agg(json_build_object('priority', ai_priority, 'count', cnt)), '[]'::json)
      FROM (
        SELECT ai_priority, COUNT(*) as cnt
        FROM lead_events
        WHERE brand_id = p_brand_id
          AND ai_processed = true
          AND ai_priority IS NOT NULL
          AND created_at >= p_from
          AND created_at < p_to
        GROUP BY ai_priority
        ORDER BY ai_priority
      ) t
    ),
    'ticket_stats', (
      SELECT json_build_object(
        'support_count', COUNT(*) FILTER (WHERE lead_type = 'support'),
        'tickets_created', COUNT(*) FILTER (WHERE should_create_ticket = true)
      )
      FROM lead_events
      WHERE brand_id = p_brand_id
        AND ai_processed = true
        AND created_at >= p_from
        AND created_at < p_to
    ),
    'daily_trend', (
      SELECT COALESCE(json_agg(json_build_object(
        'date', day::date,
        'completed', completed_cnt,
        'failed', failed_cnt
      ) ORDER BY day), '[]'::json)
      FROM (
        SELECT 
          date_trunc('day', created_at) as day,
          COUNT(*) FILTER (WHERE status = 'completed') as completed_cnt,
          COUNT(*) FILTER (WHERE status = 'failed') as failed_cnt
        FROM ai_jobs
        WHERE brand_id = p_brand_id
          AND created_at >= p_from
          AND created_at < p_to
        GROUP BY date_trunc('day', created_at)
      ) t
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;

-- RPC: Get AI Metrics Errors
CREATE OR REPLACE FUNCTION public.get_ai_metrics_errors(
  p_brand_id UUID,
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN (
    SELECT COALESCE(json_agg(json_build_object(
      'error', COALESCE(
        CASE 
          WHEN last_error LIKE '%timeout%' THEN 'Timeout'
          WHEN last_error LIKE '%rate limit%' THEN 'Rate Limit'
          WHEN last_error LIKE '%network%' THEN 'Network Error'
          WHEN last_error LIKE '%parse%' OR last_error LIKE '%JSON%' THEN 'Parse Error'
          ELSE SUBSTRING(last_error FROM 1 FOR 50)
        END,
        'Unknown'
      ),
      'count', cnt,
      'last_occurrence', last_at
    ) ORDER BY cnt DESC), '[]'::json)
    FROM (
      SELECT 
        last_error,
        COUNT(*) as cnt,
        MAX(created_at) as last_at
      FROM ai_jobs
      WHERE brand_id = p_brand_id
        AND status = 'failed'
        AND created_at >= p_from
        AND created_at < p_to
      GROUP BY last_error
      LIMIT 10
    ) t
  );
END;
$$;

-- RPC: Get Call Center Users for a brand
CREATE OR REPLACE FUNCTION public.get_brand_operators(p_brand_id UUID)
RETURNS TABLE(
  user_id UUID,
  full_name TEXT,
  email TEXT,
  role TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    u.id as user_id,
    u.full_name,
    u.email,
    ur.role::text
  FROM users u
  JOIN user_roles ur ON ur.user_id = u.id
  WHERE ur.brand_id = p_brand_id
    AND ur.role IN ('callcenter', 'sales', 'admin')
  ORDER BY u.full_name;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_ai_metrics_overview TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ai_metrics_errors TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_brand_operators TO authenticated;