-- Drop old function first, then create with extended signature
DROP FUNCTION IF EXISTS public.get_ticket_queue_counts(uuid, uuid, jsonb);

CREATE OR REPLACE FUNCTION public.get_ticket_queue_counts(
  p_brand_id uuid,
  p_current_user_id uuid DEFAULT NULL,
  p_sla_thresholds jsonb DEFAULT NULL,
  p_queue_tab text DEFAULT 'all',
  p_tag_ids uuid[] DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result json;
  v_active_statuses text[] := ARRAY['open', 'in_progress', 'reopened'];
BEGIN
  WITH base_tickets AS (
    SELECT t.*
    FROM tickets t
    WHERE t.brand_id = p_brand_id
      -- Apply queue tab filter for auto/manual counts context
      AND (
        CASE p_queue_tab
          WHEN 'my_queue' THEN 
            t.assigned_to_user_id = p_current_user_id 
            AND t.status::text = ANY(v_active_statuses)
          WHEN 'unassigned' THEN 
            t.assigned_to_user_id IS NULL 
            AND t.status::text = ANY(v_active_statuses)
          WHEN 'sla_breached' THEN 
            t.status::text = ANY(v_active_statuses)
            AND p_sla_thresholds IS NOT NULL
            AND (
              EXTRACT(EPOCH FROM (now() - t.opened_at)) / 60 > 
              COALESCE((p_sla_thresholds->>t.priority::text)::numeric, 1440)
            )
          ELSE true -- 'all'
        END
      )
      -- Apply tag filter if provided
      AND (p_tag_ids IS NULL OR array_length(p_tag_ids, 1) IS NULL OR t.category_tag_id = ANY(p_tag_ids))
  )
  SELECT json_build_object(
    -- Global queue counts (not affected by filters)
    'all', (
      SELECT COUNT(*) FROM tickets t
      WHERE t.brand_id = p_brand_id
    ),
    'my_queue', (
      SELECT COUNT(*) FROM tickets t
      WHERE t.brand_id = p_brand_id
        AND t.assigned_to_user_id = p_current_user_id
        AND t.status::text = ANY(v_active_statuses)
    ),
    'unassigned', (
      SELECT COUNT(*) FROM tickets t
      WHERE t.brand_id = p_brand_id
        AND t.assigned_to_user_id IS NULL
        AND t.status::text = ANY(v_active_statuses)
    ),
    'sla_breached', (
      SELECT COUNT(*) FROM tickets t
      WHERE t.brand_id = p_brand_id
        AND t.status::text = ANY(v_active_statuses)
        AND p_sla_thresholds IS NOT NULL
        AND (
          EXTRACT(EPOCH FROM (now() - t.opened_at)) / 60 > 
          COALESCE((p_sla_thresholds->>t.priority::text)::numeric, 1440)
        )
    ),
    -- Contextual counts (based on current queue tab + tag filters)
    'auto_count', (
      SELECT COUNT(*) FROM base_tickets bt
      WHERE bt.assigned_at IS NOT NULL AND bt.assigned_by_user_id IS NULL
    ),
    'manual_count', (
      SELECT COUNT(*) FROM base_tickets bt
      WHERE bt.assigned_by_user_id IS NOT NULL
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_ticket_queue_counts IS 'Lightweight RPC for queue tab counts + contextual auto/manual counts';