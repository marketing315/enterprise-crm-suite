-- Fix the search_tickets_v2 function with proper type casting for ticket_status
CREATE OR REPLACE FUNCTION public.search_tickets_v2(
  p_brand_id UUID DEFAULT NULL,
  p_brand_ids UUID[] DEFAULT NULL,
  p_queue_tab TEXT DEFAULT 'all',
  p_current_user_id UUID DEFAULT NULL,
  p_search_query TEXT DEFAULT NULL,
  p_tag_ids UUID[] DEFAULT NULL,
  p_assignment_type TEXT DEFAULT 'all',
  p_statuses TEXT[] DEFAULT NULL,
  p_sla_thresholds TEXT DEFAULT NULL,
  p_limit INT DEFAULT 50,
  p_cursor JSONB DEFAULT NULL,
  p_direction TEXT DEFAULT 'next'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tickets JSONB;
  v_total_count INT;
  v_result JSONB;
  v_sla JSONB;
  v_active_statuses ticket_status[] := ARRAY['open'::ticket_status, 'in_progress'::ticket_status, 'reopened'::ticket_status];
  v_effective_brand_ids UUID[];
BEGIN
  -- Determine effective brand IDs
  IF p_brand_ids IS NOT NULL AND array_length(p_brand_ids, 1) > 0 THEN
    v_effective_brand_ids := p_brand_ids;
  ELSIF p_brand_id IS NOT NULL THEN
    v_effective_brand_ids := ARRAY[p_brand_id];
  ELSE
    RETURN jsonb_build_object(
      'tickets', '[]'::jsonb,
      'total_count', 0,
      'limit', p_limit,
      'has_next', false,
      'has_prev', false,
      'next_cursor', null,
      'prev_cursor', null
    );
  END IF;

  -- Parse SLA thresholds
  IF p_sla_thresholds IS NOT NULL THEN
    v_sla := p_sla_thresholds::jsonb;
  ELSE
    v_sla := '{"1": 30, "2": 60, "3": 240, "4": 480, "5": 1440}'::jsonb;
  END IF;

  -- Build main query with filters
  WITH filtered_tickets AS (
    SELECT t.*
    FROM tickets t
    WHERE t.brand_id = ANY(v_effective_brand_ids)
      AND t.archived = false
      -- Queue tab filters
      AND (
        p_queue_tab = 'all'
        OR (p_queue_tab = 'my_queue' AND t.assigned_to_user_id = p_current_user_id AND t.status = ANY(v_active_statuses))
        OR (p_queue_tab = 'unassigned' AND t.assigned_to_user_id IS NULL AND t.status = ANY(v_active_statuses))
        OR (p_queue_tab = 'sla_breached' AND t.status = ANY(v_active_statuses) AND
            EXTRACT(EPOCH FROM (now() - t.opened_at)) / 60 > 
            COALESCE((v_sla->>t.priority::text)::int, 240))
      )
      -- Search filter
      AND (
        p_search_query IS NULL 
        OR t.title ILIKE '%' || p_search_query || '%'
        OR t.description ILIKE '%' || p_search_query || '%'
        OR EXISTS (
          SELECT 1 FROM contacts c 
          WHERE c.id = t.contact_id 
          AND (
            c.first_name ILIKE '%' || p_search_query || '%'
            OR c.last_name ILIKE '%' || p_search_query || '%'
            OR c.email ILIKE '%' || p_search_query || '%'
          )
        )
      )
      -- Tag filter
      AND (p_tag_ids IS NULL OR t.category_tag_id = ANY(p_tag_ids))
      -- Assignment type filter
      AND (
        p_assignment_type = 'all'
        OR (p_assignment_type = 'auto' AND t.assigned_by_user_id IS NULL AND t.assigned_to_user_id IS NOT NULL)
        OR (p_assignment_type = 'manual' AND t.assigned_by_user_id IS NOT NULL)
      )
      -- Status filter
      AND (p_statuses IS NULL OR t.status = ANY(ARRAY(SELECT unnest(p_statuses)::ticket_status)))
  ),
  counted AS (
    SELECT COUNT(*) as cnt FROM filtered_tickets
  ),
  paginated AS (
    SELECT ft.*
    FROM filtered_tickets ft
    WHERE (
      p_cursor IS NULL
      OR (
        p_direction = 'next' AND (
          ft.priority > (p_cursor->>'priority')::int
          OR (ft.priority = (p_cursor->>'priority')::int AND ft.opened_at > (p_cursor->>'opened_at')::timestamptz)
          OR (ft.priority = (p_cursor->>'priority')::int AND ft.opened_at = (p_cursor->>'opened_at')::timestamptz AND ft.id > (p_cursor->>'id')::uuid)
        )
      )
      OR (
        p_direction = 'prev' AND (
          ft.priority < (p_cursor->>'priority')::int
          OR (ft.priority = (p_cursor->>'priority')::int AND ft.opened_at < (p_cursor->>'opened_at')::timestamptz)
          OR (ft.priority = (p_cursor->>'priority')::int AND ft.opened_at = (p_cursor->>'opened_at')::timestamptz AND ft.id < (p_cursor->>'id')::uuid)
        )
      )
    )
    ORDER BY 
      CASE WHEN p_direction = 'prev' THEN ft.priority END DESC,
      CASE WHEN p_direction = 'prev' THEN ft.opened_at END DESC,
      CASE WHEN p_direction = 'prev' THEN ft.id END DESC,
      CASE WHEN p_direction = 'next' OR p_direction IS NULL THEN ft.priority END ASC,
      CASE WHEN p_direction = 'next' OR p_direction IS NULL THEN ft.opened_at END ASC,
      CASE WHEN p_direction = 'next' OR p_direction IS NULL THEN ft.id END ASC
    LIMIT p_limit + 1
  ),
  with_relations AS (
    SELECT 
      p.id, p.brand_id, p.contact_id, p.deal_id, p.status, p.priority,
      p.title, p.description, p.category_tag_id, p.assigned_to_user_id,
      p.assigned_by_user_id, p.assigned_at, p.created_by, p.source_event_id,
      p.opened_at, p.resolved_at, p.closed_at, p.sla_breached_at,
      p.created_at, p.updated_at, p.archived, p.archived_at, p.archived_by_user_id,
      jsonb_build_object(
        'id', c.id,
        'first_name', c.first_name,
        'last_name', c.last_name,
        'email', c.email,
        'contact_phones', COALESCE((
          SELECT jsonb_agg(jsonb_build_object('phone_raw', cp.phone_raw, 'is_primary', cp.is_primary))
          FROM contact_phones cp WHERE cp.contact_id = c.id
        ), '[]'::jsonb)
      ) as contacts,
      CASE WHEN tg.id IS NOT NULL THEN jsonb_build_object('id', tg.id, 'name', tg.name, 'color', tg.color) ELSE NULL END as tags,
      CASE WHEN u.id IS NOT NULL THEN jsonb_build_object('id', u.id, 'full_name', u.full_name, 'email', u.email) ELSE NULL END as users,
      CASE WHEN ab.id IS NOT NULL THEN jsonb_build_object('id', ab.id, 'full_name', ab.full_name, 'email', ab.email) ELSE NULL END as assigned_by
    FROM paginated p
    LEFT JOIN contacts c ON c.id = p.contact_id
    LEFT JOIN tags tg ON tg.id = p.category_tag_id
    LEFT JOIN users u ON u.id = p.assigned_to_user_id
    LEFT JOIN users ab ON ab.id = p.assigned_by_user_id
  )
  SELECT 
    (SELECT cnt FROM counted),
    COALESCE(jsonb_agg(to_jsonb(wr.*) ORDER BY wr.priority ASC, wr.opened_at ASC, wr.id ASC), '[]'::jsonb)
  INTO v_total_count, v_tickets
  FROM with_relations wr;

  -- If direction is prev, reverse the results
  IF p_direction = 'prev' THEN
    SELECT jsonb_agg(elem ORDER BY (elem->>'priority')::int ASC, (elem->>'opened_at') ASC, elem->>'id' ASC)
    INTO v_tickets
    FROM jsonb_array_elements(v_tickets) elem;
  END IF;

  -- Build result with pagination info
  v_result := jsonb_build_object(
    'tickets', CASE 
      WHEN jsonb_array_length(v_tickets) > p_limit 
      THEN v_tickets - (jsonb_array_length(v_tickets) - 1)
      ELSE v_tickets 
    END,
    'total_count', v_total_count,
    'limit', p_limit,
    'has_next', jsonb_array_length(v_tickets) > p_limit,
    'has_prev', p_cursor IS NOT NULL,
    'next_cursor', CASE 
      WHEN jsonb_array_length(v_tickets) > p_limit THEN
        jsonb_build_object(
          'priority', (v_tickets->(p_limit - 1)->>'priority')::int,
          'opened_at', v_tickets->(p_limit - 1)->>'opened_at',
          'id', v_tickets->(p_limit - 1)->>'id'
        )
      ELSE NULL 
    END,
    'prev_cursor', CASE 
      WHEN jsonb_array_length(v_tickets) > 0 THEN
        jsonb_build_object(
          'priority', (v_tickets->0->>'priority')::int,
          'opened_at', v_tickets->0->>'opened_at',
          'id', v_tickets->0->>'id'
        )
      ELSE NULL 
    END
  );

  RETURN v_result;
END;
$$;


-- Fix the get_ticket_queue_counts function with proper type casting
CREATE OR REPLACE FUNCTION public.get_ticket_queue_counts(
  p_brand_id UUID DEFAULT NULL,
  p_brand_ids UUID[] DEFAULT NULL,
  p_current_user_id UUID DEFAULT NULL,
  p_sla_thresholds TEXT DEFAULT NULL,
  p_queue_tab TEXT DEFAULT 'all',
  p_tag_ids UUID[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sla JSONB;
  v_active_statuses ticket_status[] := ARRAY['open'::ticket_status, 'in_progress'::ticket_status, 'reopened'::ticket_status];
  v_all_count INT;
  v_my_queue_count INT;
  v_unassigned_count INT;
  v_sla_breached_count INT;
  v_auto_count INT;
  v_manual_count INT;
  v_effective_brand_ids UUID[];
BEGIN
  -- Determine effective brand IDs
  IF p_brand_ids IS NOT NULL AND array_length(p_brand_ids, 1) > 0 THEN
    v_effective_brand_ids := p_brand_ids;
  ELSIF p_brand_id IS NOT NULL THEN
    v_effective_brand_ids := ARRAY[p_brand_id];
  ELSE
    RETURN jsonb_build_object(
      'all', 0,
      'my_queue', 0,
      'unassigned', 0,
      'sla_breached', 0,
      'auto_count', 0,
      'manual_count', 0
    );
  END IF;

  -- Parse SLA thresholds
  IF p_sla_thresholds IS NOT NULL THEN
    v_sla := p_sla_thresholds::jsonb;
  ELSE
    v_sla := '{"1": 30, "2": 60, "3": 240, "4": 480, "5": 1440}'::jsonb;
  END IF;

  -- Count all non-archived tickets
  SELECT COUNT(*) INTO v_all_count
  FROM tickets t
  WHERE t.brand_id = ANY(v_effective_brand_ids) AND t.archived = false;

  -- Count my queue
  SELECT COUNT(*) INTO v_my_queue_count
  FROM tickets t
  WHERE t.brand_id = ANY(v_effective_brand_ids) 
    AND t.archived = false
    AND t.status = ANY(v_active_statuses)
    AND t.assigned_to_user_id = p_current_user_id;

  -- Count unassigned
  SELECT COUNT(*) INTO v_unassigned_count
  FROM tickets t
  WHERE t.brand_id = ANY(v_effective_brand_ids)
    AND t.archived = false
    AND t.status = ANY(v_active_statuses)
    AND t.assigned_to_user_id IS NULL;

  -- Count SLA breached
  SELECT COUNT(*) INTO v_sla_breached_count
  FROM tickets t
  WHERE t.brand_id = ANY(v_effective_brand_ids)
    AND t.archived = false
    AND t.status = ANY(v_active_statuses)
    AND EXTRACT(EPOCH FROM (now() - t.opened_at)) / 60 > 
        COALESCE((v_sla->>t.priority::text)::int, 240);

  -- Count auto-assigned (contextual based on current queue tab)
  WITH filtered AS (
    SELECT t.*
    FROM tickets t
    WHERE t.brand_id = ANY(v_effective_brand_ids)
      AND t.archived = false
      AND (p_tag_ids IS NULL OR t.category_tag_id = ANY(p_tag_ids))
      AND (
        p_queue_tab = 'all'
        OR (p_queue_tab = 'my_queue' AND t.assigned_to_user_id = p_current_user_id AND t.status = ANY(v_active_statuses))
        OR (p_queue_tab = 'unassigned' AND t.assigned_to_user_id IS NULL AND t.status = ANY(v_active_statuses))
        OR (p_queue_tab = 'sla_breached' AND t.status = ANY(v_active_statuses) AND
            EXTRACT(EPOCH FROM (now() - t.opened_at)) / 60 > 
            COALESCE((v_sla->>t.priority::text)::int, 240))
      )
  )
  SELECT 
    COUNT(*) FILTER (WHERE f.assigned_by_user_id IS NULL AND f.assigned_to_user_id IS NOT NULL),
    COUNT(*) FILTER (WHERE f.assigned_by_user_id IS NOT NULL)
  INTO v_auto_count, v_manual_count
  FROM filtered f;

  RETURN jsonb_build_object(
    'all', v_all_count,
    'my_queue', v_my_queue_count,
    'unassigned', v_unassigned_count,
    'sla_breached', v_sla_breached_count,
    'auto_count', v_auto_count,
    'manual_count', v_manual_count
  );
END;
$$;