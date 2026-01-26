-- ============================================
-- Performance & Scaling: search_tickets_v1 RPC
-- ============================================

-- 1. Create optimized indexes for ticket queries
CREATE INDEX IF NOT EXISTS idx_tickets_brand_status_priority_opened 
ON public.tickets (brand_id, status, priority, opened_at);

CREATE INDEX IF NOT EXISTS idx_tickets_brand_assignee_status_opened 
ON public.tickets (brand_id, assigned_to_user_id, status, opened_at);

CREATE INDEX IF NOT EXISTS idx_tickets_brand_category_opened 
ON public.tickets (brand_id, category_tag_id, opened_at);

CREATE INDEX IF NOT EXISTS idx_tickets_brand_assigned_by 
ON public.tickets (brand_id, assigned_by_user_id) WHERE assigned_by_user_id IS NOT NULL;

-- Index for contact search (phone lookup)
CREATE INDEX IF NOT EXISTS idx_contact_phones_brand_normalized 
ON public.contact_phones (brand_id, phone_normalized);

-- 2. Create the search_tickets_v1 RPC
CREATE OR REPLACE FUNCTION public.search_tickets_v1(
  p_brand_id uuid,
  p_queue_tab text DEFAULT 'all',           -- 'my_queue' | 'unassigned' | 'sla_breached' | 'all'
  p_current_user_id uuid DEFAULT NULL,      -- Required for 'my_queue'
  p_search_query text DEFAULT NULL,
  p_tag_ids uuid[] DEFAULT NULL,
  p_assignment_type text DEFAULT 'all',     -- 'all' | 'auto' | 'manual'
  p_statuses text[] DEFAULT NULL,           -- Optional status filter
  p_sla_thresholds jsonb DEFAULT NULL,      -- SLA thresholds for 'sla_breached' queue
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result json;
  v_total_count integer;
  v_active_statuses text[] := ARRAY['open', 'in_progress', 'reopened'];
BEGIN
  -- Build the result with tickets and metadata
  WITH filtered_tickets AS (
    SELECT 
      t.id,
      t.brand_id,
      t.contact_id,
      t.deal_id,
      t.status,
      t.priority,
      t.title,
      t.description,
      t.category_tag_id,
      t.assigned_to_user_id,
      t.assigned_by_user_id,
      t.assigned_at,
      t.created_by,
      t.source_event_id,
      t.opened_at,
      t.resolved_at,
      t.closed_at,
      t.created_at,
      t.updated_at,
      -- Calculate age in minutes for SLA check
      EXTRACT(EPOCH FROM (now() - t.opened_at)) / 60 AS age_minutes
    FROM tickets t
    WHERE t.brand_id = p_brand_id
      -- Queue tab filtering
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
      -- Status filter (optional)
      AND (p_statuses IS NULL OR t.status::text = ANY(p_statuses))
      -- Tag/Category filter
      AND (p_tag_ids IS NULL OR array_length(p_tag_ids, 1) IS NULL OR t.category_tag_id = ANY(p_tag_ids))
      -- Assignment type filter
      AND (
        CASE p_assignment_type
          WHEN 'auto' THEN t.assigned_at IS NOT NULL AND t.assigned_by_user_id IS NULL
          WHEN 'manual' THEN t.assigned_by_user_id IS NOT NULL
          ELSE true -- 'all'
        END
      )
      -- Search query (contact name, email, phone, ticket title/description)
      AND (
        p_search_query IS NULL 
        OR p_search_query = ''
        OR EXISTS (
          SELECT 1 FROM contacts c
          WHERE c.id = t.contact_id
          AND (
            c.first_name ILIKE '%' || p_search_query || '%'
            OR c.last_name ILIKE '%' || p_search_query || '%'
            OR (c.first_name || ' ' || c.last_name) ILIKE '%' || p_search_query || '%'
            OR c.email ILIKE '%' || p_search_query || '%'
          )
        )
        OR EXISTS (
          SELECT 1 FROM contact_phones cp
          WHERE cp.contact_id = t.contact_id
          AND cp.phone_normalized LIKE regexp_replace(p_search_query, '[^0-9]', '', 'g') || '%'
        )
        OR t.title ILIKE '%' || p_search_query || '%'
        OR t.description ILIKE '%' || p_search_query || '%'
      )
  ),
  counted AS (
    SELECT COUNT(*) AS total FROM filtered_tickets
  ),
  paginated AS (
    SELECT ft.*
    FROM filtered_tickets ft
    -- Smart sorting: Priority ASC (P1 first), then oldest first (aging)
    ORDER BY ft.priority ASC, ft.opened_at ASC
    LIMIT p_limit
    OFFSET p_offset
  ),
  with_relations AS (
    SELECT 
      p.*,
      -- Contact data
      json_build_object(
        'id', c.id,
        'first_name', c.first_name,
        'last_name', c.last_name,
        'email', c.email,
        'contact_phones', COALESCE(
          (SELECT json_agg(json_build_object('phone_raw', cp.phone_raw, 'is_primary', cp.is_primary))
           FROM contact_phones cp WHERE cp.contact_id = c.id AND cp.is_active = true),
          '[]'::json
        )
      ) AS contacts,
      -- Category tag data
      CASE WHEN tg.id IS NOT NULL THEN
        json_build_object('id', tg.id, 'name', tg.name, 'color', tg.color)
      ELSE NULL END AS tags,
      -- Assigned user data
      CASE WHEN u.id IS NOT NULL THEN
        json_build_object('id', u.id, 'full_name', u.full_name, 'email', u.email)
      ELSE NULL END AS users,
      -- Assigned by user data
      CASE WHEN ab.id IS NOT NULL THEN
        json_build_object('id', ab.id, 'full_name', ab.full_name, 'email', ab.email)
      ELSE NULL END AS assigned_by
    FROM paginated p
    LEFT JOIN contacts c ON c.id = p.contact_id
    LEFT JOIN tags tg ON tg.id = p.category_tag_id
    LEFT JOIN users u ON u.id = p.assigned_to_user_id
    LEFT JOIN users ab ON ab.id = p.assigned_by_user_id
    ORDER BY p.priority ASC, p.opened_at ASC
  )
  SELECT json_build_object(
    'tickets', COALESCE((SELECT json_agg(row_to_json(wr)) FROM with_relations wr), '[]'::json),
    'total_count', (SELECT total FROM counted),
    'limit', p_limit,
    'offset', p_offset,
    'has_more', (SELECT total FROM counted) > (p_offset + p_limit)
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;

-- 3. Create a helper RPC for queue counts (lightweight, no pagination)
CREATE OR REPLACE FUNCTION public.get_ticket_queue_counts(
  p_brand_id uuid,
  p_current_user_id uuid DEFAULT NULL,
  p_sla_thresholds jsonb DEFAULT NULL
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
  SELECT json_build_object(
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
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;

-- Add comments for documentation
COMMENT ON FUNCTION public.search_tickets_v1 IS 'Server-side ticket search with filtering, pagination, and smart sorting (priority + aging)';
COMMENT ON FUNCTION public.get_ticket_queue_counts IS 'Lightweight RPC to get ticket counts for queue tabs';