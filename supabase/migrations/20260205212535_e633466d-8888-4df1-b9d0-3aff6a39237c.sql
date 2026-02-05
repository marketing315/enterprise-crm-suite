-- Fix get_pipeline_funnel_analytics: ps.position → ps.order_index
CREATE OR REPLACE FUNCTION public.get_pipeline_funnel_analytics(p_brand_id uuid, p_from timestamp with time zone DEFAULT (now() - '30 days'::interval), p_to timestamp with time zone DEFAULT now())
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID := get_user_id(auth.uid());
  v_result JSON;
BEGIN
  -- Validate brand access
  IF NOT user_belongs_to_brand(v_user_id, p_brand_id) THEN
    RAISE EXCEPTION 'Access denied to brand';
  END IF;

  WITH stage_data AS (
    SELECT 
      ps.id AS stage_id,
      ps.name AS stage_name,
      ps.color AS stage_color,
      ps.order_index AS stage_position,
      -- Deals that entered this stage in the period
      COUNT(DISTINCT CASE 
        WHEN dsh.to_stage_id = ps.id AND dsh.changed_at BETWEEN p_from AND p_to 
        THEN dsh.deal_id 
      END) AS deals_entered,
      -- Deals that exited to a later stage
      COUNT(DISTINCT CASE 
        WHEN dsh.from_stage_id = ps.id 
          AND dsh.changed_at BETWEEN p_from AND p_to
          AND EXISTS (
            SELECT 1 FROM pipeline_stages ps2 
            WHERE ps2.id = dsh.to_stage_id 
              AND ps2.order_index > ps.order_index
          )
        THEN dsh.deal_id 
      END) AS deals_exited_to_next,
      -- Deals won from this stage
      COUNT(DISTINCT CASE 
        WHEN d.status = 'won' 
          AND d.current_stage_id = ps.id
          AND d.closed_at BETWEEN p_from AND p_to
        THEN d.id 
      END) AS deals_won,
      -- Deals lost from this stage
      COUNT(DISTINCT CASE 
        WHEN d.status = 'lost' 
          AND d.current_stage_id = ps.id
          AND d.closed_at BETWEEN p_from AND p_to
        THEN d.id 
      END) AS deals_lost,
      -- Average days in stage
      COALESCE(
        AVG(
          CASE 
            WHEN dsh.from_stage_id = ps.id 
            THEN EXTRACT(EPOCH FROM (
              COALESCE(
                (SELECT MIN(dsh2.changed_at) 
                 FROM deal_stage_history dsh2 
                 WHERE dsh2.deal_id = dsh.deal_id 
                   AND dsh2.from_stage_id = ps.id
                   AND dsh2.changed_at > dsh.changed_at),
                NOW()
              ) - dsh.changed_at
            )) / 86400
          END
        ),
        0
      ) AS avg_days_in_stage
    FROM pipeline_stages ps
    LEFT JOIN deal_stage_history dsh ON dsh.to_stage_id = ps.id OR dsh.from_stage_id = ps.id
    LEFT JOIN deals d ON d.current_stage_id = ps.id AND d.brand_id = p_brand_id
    WHERE ps.is_active = true
    GROUP BY ps.id, ps.name, ps.color, ps.order_index
    ORDER BY ps.order_index
  ),
  overall_stats AS (
    SELECT
      COUNT(*) FILTER (WHERE status = 'won' AND closed_at BETWEEN p_from AND p_to) AS total_won,
      COUNT(*) FILTER (WHERE status = 'lost' AND closed_at BETWEEN p_from AND p_to) AS total_lost,
      COUNT(*) FILTER (WHERE created_at BETWEEN p_from AND p_to) AS total_deals,
      COALESCE(SUM(value) FILTER (WHERE status IN ('open', 'reopened')), 0) AS total_pipeline_value,
      COALESCE(
        AVG(EXTRACT(EPOCH FROM (closed_at - created_at)) / 86400) 
        FILTER (WHERE status IN ('won', 'lost') AND closed_at BETWEEN p_from AND p_to),
        0
      ) AS avg_velocity_days
    FROM deals
    WHERE brand_id = p_brand_id
  )
  SELECT json_build_object(
    'stages', COALESCE((
      SELECT json_agg(json_build_object(
        'stage_id', stage_id,
        'stage_name', stage_name,
        'stage_color', stage_color,
        'deals_entered', deals_entered,
        'deals_exited_to_next', deals_exited_to_next,
        'deals_won', deals_won,
        'deals_lost', deals_lost,
        'conversion_rate', CASE 
          WHEN deals_entered > 0 
          THEN ROUND((deals_exited_to_next::NUMERIC / deals_entered) * 100, 1)
          ELSE 0 
        END,
        'avg_days_in_stage', ROUND(avg_days_in_stage::NUMERIC, 1)
      ) ORDER BY stage_position)
      FROM stage_data
    ), '[]'::json),
    'total_deals', COALESCE((SELECT total_deals FROM overall_stats), 0),
    'overall_win_rate', COALESCE((
      SELECT CASE 
        WHEN (total_won + total_lost) > 0 
        THEN ROUND((total_won::NUMERIC / (total_won + total_lost)) * 100, 1)
        ELSE 0 
      END
      FROM overall_stats
    ), 0),
    'avg_deal_velocity_days', COALESCE((SELECT ROUND(avg_velocity_days::NUMERIC, 1) FROM overall_stats), 0),
    'total_pipeline_value', COALESCE((SELECT total_pipeline_value FROM overall_stats), 0)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;