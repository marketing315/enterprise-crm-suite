-- ============================================
-- M11: Advanced Analytics RPC Functions
-- ============================================

-- 1. Pipeline Funnel Analytics
-- Returns conversion rates, drop-off, and duration per stage
CREATE OR REPLACE FUNCTION get_pipeline_funnel_analytics(
  p_brand_id UUID,
  p_from TIMESTAMPTZ DEFAULT NOW() - INTERVAL '30 days',
  p_to TIMESTAMPTZ DEFAULT NOW()
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      ps.position AS stage_position,
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
              AND ps2.position > ps.position
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
    WHERE ps.brand_id = p_brand_id
      AND ps.is_active = true
    GROUP BY ps.id, ps.name, ps.color, ps.position
    ORDER BY ps.position
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
$$;

-- 2. Lead Source Analytics
-- Returns performance metrics per lead source
CREATE OR REPLACE FUNCTION get_lead_source_analytics(
  p_brand_id UUID,
  p_from TIMESTAMPTZ DEFAULT NOW() - INTERVAL '30 days',
  p_to TIMESTAMPTZ DEFAULT NOW()
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := get_user_id(auth.uid());
  v_result JSON;
BEGIN
  -- Validate brand access
  IF NOT user_belongs_to_brand(v_user_id, p_brand_id) THEN
    RAISE EXCEPTION 'Access denied to brand';
  END IF;

  WITH source_data AS (
    SELECT 
      le.source,
      COALESCE(le.source_name, le.source::TEXT) AS source_name,
      COUNT(DISTINCT le.id) AS leads_count,
      COUNT(DISTINCT le.deal_id) AS deals_created,
      COUNT(DISTINCT CASE WHEN d.status = 'won' THEN d.id END) AS deals_won,
      COALESCE(SUM(CASE WHEN d.status = 'won' THEN d.value ELSE 0 END), 0) AS total_value_won,
      COUNT(DISTINCT le.contact_id) AS unique_contacts
    FROM lead_events le
    LEFT JOIN deals d ON d.id = le.deal_id
    WHERE le.brand_id = p_brand_id
      AND le.created_at BETWEEN p_from AND p_to
    GROUP BY le.source, COALESCE(le.source_name, le.source::TEXT)
  )
  SELECT json_build_object(
    'sources', COALESCE((
      SELECT json_agg(json_build_object(
        'source', source,
        'source_name', source_name,
        'leads_count', leads_count,
        'deals_created', deals_created,
        'deals_won', deals_won,
        'total_value_won', total_value_won,
        'unique_contacts', unique_contacts,
        'conversion_rate', CASE 
          WHEN leads_count > 0 
          THEN ROUND((deals_won::NUMERIC / leads_count) * 100, 1)
          ELSE 0 
        END,
        'avg_deal_value', CASE 
          WHEN deals_won > 0 
          THEN ROUND(total_value_won / deals_won, 2)
          ELSE 0 
        END
      ) ORDER BY leads_count DESC)
      FROM source_data
    ), '[]'::json),
    'total_leads', COALESCE((SELECT SUM(leads_count) FROM source_data), 0),
    'total_deals_won', COALESCE((SELECT SUM(deals_won) FROM source_data), 0),
    'total_revenue', COALESCE((SELECT SUM(total_value_won) FROM source_data), 0)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- 3. Deal Velocity Metrics
-- Returns time-based deal movement analytics
CREATE OR REPLACE FUNCTION get_deal_velocity_metrics(
  p_brand_id UUID,
  p_from TIMESTAMPTZ DEFAULT NOW() - INTERVAL '30 days',
  p_to TIMESTAMPTZ DEFAULT NOW()
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := get_user_id(auth.uid());
  v_result JSON;
BEGIN
  -- Validate brand access
  IF NOT user_belongs_to_brand(v_user_id, p_brand_id) THEN
    RAISE EXCEPTION 'Access denied to brand';
  END IF;

  WITH velocity_data AS (
    SELECT
      -- Average time to close (won deals)
      AVG(
        EXTRACT(EPOCH FROM (closed_at - created_at)) / 86400
      ) FILTER (WHERE status = 'won' AND closed_at BETWEEN p_from AND p_to) AS avg_days_to_win,
      -- Average time to lose
      AVG(
        EXTRACT(EPOCH FROM (closed_at - created_at)) / 86400
      ) FILTER (WHERE status = 'lost' AND closed_at BETWEEN p_from AND p_to) AS avg_days_to_lose,
      -- Deals closed in period
      COUNT(*) FILTER (WHERE status = 'won' AND closed_at BETWEEN p_from AND p_to) AS deals_won_count,
      COUNT(*) FILTER (WHERE status = 'lost' AND closed_at BETWEEN p_from AND p_to) AS deals_lost_count,
      -- New deals in period
      COUNT(*) FILTER (WHERE created_at BETWEEN p_from AND p_to) AS new_deals_count,
      -- Average deal value
      AVG(value) FILTER (WHERE status = 'won' AND closed_at BETWEEN p_from AND p_to) AS avg_won_value,
      -- Total value won
      SUM(value) FILTER (WHERE status = 'won' AND closed_at BETWEEN p_from AND p_to) AS total_won_value
    FROM deals
    WHERE brand_id = p_brand_id
  ),
  weekly_trend AS (
    SELECT 
      date_trunc('week', created_at) AS week_start,
      COUNT(*) AS deals_created,
      COUNT(*) FILTER (WHERE status = 'won') AS deals_won
    FROM deals
    WHERE brand_id = p_brand_id
      AND created_at BETWEEN p_from AND p_to
    GROUP BY date_trunc('week', created_at)
    ORDER BY week_start
  )
  SELECT json_build_object(
    'avg_days_to_win', COALESCE((SELECT ROUND(avg_days_to_win::NUMERIC, 1) FROM velocity_data), 0),
    'avg_days_to_lose', COALESCE((SELECT ROUND(avg_days_to_lose::NUMERIC, 1) FROM velocity_data), 0),
    'deals_won_count', COALESCE((SELECT deals_won_count FROM velocity_data), 0),
    'deals_lost_count', COALESCE((SELECT deals_lost_count FROM velocity_data), 0),
    'new_deals_count', COALESCE((SELECT new_deals_count FROM velocity_data), 0),
    'avg_won_value', COALESCE((SELECT ROUND(avg_won_value::NUMERIC, 2) FROM velocity_data), 0),
    'total_won_value', COALESCE((SELECT total_won_value FROM velocity_data), 0),
    'weekly_trend', COALESCE((
      SELECT json_agg(json_build_object(
        'week_start', week_start,
        'deals_created', deals_created,
        'deals_won', deals_won
      ) ORDER BY week_start)
      FROM weekly_trend
    ), '[]'::json)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_pipeline_funnel_analytics(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION get_lead_source_analytics(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION get_deal_velocity_metrics(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;