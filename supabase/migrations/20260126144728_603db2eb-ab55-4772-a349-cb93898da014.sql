-- Update search_tickets_v2 to include sla_breached_at in the response
CREATE OR REPLACE FUNCTION public.search_tickets_v2(
  p_brand_id uuid, 
  p_queue_tab text DEFAULT 'all'::text, 
  p_current_user_id uuid DEFAULT NULL::uuid, 
  p_search_query text DEFAULT NULL::text, 
  p_tag_ids uuid[] DEFAULT NULL::uuid[], 
  p_assignment_type text DEFAULT 'all'::text, 
  p_statuses text[] DEFAULT NULL::text[], 
  p_sla_thresholds jsonb DEFAULT NULL::jsonb, 
  p_limit integer DEFAULT 50, 
  p_cursor jsonb DEFAULT NULL::jsonb, 
  p_direction text DEFAULT 'next'::text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_limit int := GREATEST(1, LEAST(COALESCE(p_limit, 50), 200));
  v_dir text := COALESCE(p_direction, 'next');
  v_cursor_priority int;
  v_cursor_opened_at timestamptz;
  v_cursor_id uuid;
  v_active_statuses text[] := ARRAY['open', 'in_progress', 'reopened'];
  v_total_count int := 0;
  v_has_next boolean := false;
  v_has_prev boolean := false;
  v_next_cursor jsonb := null;
  v_prev_cursor jsonb := null;
  v_rows jsonb := '[]'::jsonb;
  v_first_cursor jsonb := null;
  v_last_cursor jsonb := null;
  v_ordered_count int := 0;
BEGIN
  -- Parse cursor if present
  IF p_cursor IS NOT NULL THEN
    v_cursor_priority := (p_cursor->>'priority')::int;
    v_cursor_opened_at := (p_cursor->>'opened_at')::timestamptz;
    v_cursor_id := (p_cursor->>'id')::uuid;
  END IF;

  -- Get total count and paginated results
  WITH base AS (
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
      t.sla_breached_at  -- Added sla_breached_at
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
  total AS (
    SELECT COUNT(*)::int AS c FROM base
  ),
  -- Apply cursor windowing
  windowed AS (
    SELECT *
    FROM base b
    WHERE
      -- If no cursor, don't filter
      (p_cursor IS NULL)
      OR
      (
        -- NEXT: greater than cursor (priority ASC, opened_at ASC, id ASC)
        v_dir = 'next' AND (
          (b.priority > v_cursor_priority)
          OR (b.priority = v_cursor_priority AND b.opened_at > v_cursor_opened_at)
          OR (b.priority = v_cursor_priority AND b.opened_at = v_cursor_opened_at AND b.id > v_cursor_id)
        )
      )
      OR
      (
        -- PREV: less than cursor (priority ASC, opened_at ASC, id ASC)
        v_dir = 'prev' AND (
          (b.priority < v_cursor_priority)
          OR (b.priority = v_cursor_priority AND b.opened_at < v_cursor_opened_at)
          OR (b.priority = v_cursor_priority AND b.opened_at = v_cursor_opened_at AND b.id < v_cursor_id)
        )
      )
  ),
  -- Order depending on direction (fetch limit+1 to detect has_more)
  ordered AS (
    SELECT *
    FROM windowed
    ORDER BY
      CASE WHEN v_dir = 'prev' THEN priority END DESC,
      CASE WHEN v_dir = 'prev' THEN opened_at END DESC,
      CASE WHEN v_dir = 'prev' THEN id END DESC,
      CASE WHEN v_dir <> 'prev' THEN priority END ASC,
      CASE WHEN v_dir <> 'prev' THEN opened_at END ASC,
      CASE WHEN v_dir <> 'prev' THEN id END ASC
    LIMIT v_limit + 1
  ),
  -- Trim to actual limit
  trimmed AS (
    SELECT * FROM ordered LIMIT v_limit
  ),
  -- Always return in canonical order (priority ASC, opened_at ASC, id ASC)
  final_rows AS (
    SELECT * FROM trimmed
    ORDER BY priority ASC, opened_at ASC, id ASC
  ),
  -- Build relations for each ticket
  with_relations AS (
    SELECT 
      fr.*,
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
    FROM final_rows fr
    LEFT JOIN contacts c ON c.id = fr.contact_id
    LEFT JOIN tags tg ON tg.id = fr.category_tag_id
    LEFT JOIN users u ON u.id = fr.assigned_to_user_id
    LEFT JOIN users ab ON ab.id = fr.assigned_by_user_id
    ORDER BY fr.priority ASC, fr.opened_at ASC, fr.id ASC
  )
  SELECT
    (SELECT c FROM total),
    (SELECT COUNT(*) FROM ordered),
    (SELECT jsonb_agg(row_to_json(wr)) FROM with_relations wr),
    (SELECT jsonb_build_object('priority', priority, 'opened_at', opened_at, 'id', id)
     FROM final_rows ORDER BY priority ASC, opened_at ASC, id ASC LIMIT 1),
    (SELECT jsonb_build_object('priority', priority, 'opened_at', opened_at, 'id', id)
     FROM final_rows ORDER BY priority DESC, opened_at DESC, id DESC LIMIT 1)
  INTO
    v_total_count,
    v_ordered_count,
    v_rows,
    v_first_cursor,
    v_last_cursor;

  -- Determine has_next: if we fetched more than limit, there are more records
  v_has_next := v_ordered_count > v_limit;
  
  -- Set cursors for navigation
  v_next_cursor := v_last_cursor;
  v_prev_cursor := v_first_cursor;

  -- Determine has_prev: check if any records exist before the first cursor
  IF v_first_cursor IS NOT NULL AND (p_cursor IS NOT NULL OR v_dir = 'prev') THEN
    PERFORM 1
    FROM tickets t
    WHERE t.brand_id = p_brand_id
      -- Same base filters
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
          ELSE true
        END
      )
      AND (p_statuses IS NULL OR t.status::text = ANY(p_statuses))
      AND (p_tag_ids IS NULL OR array_length(p_tag_ids, 1) IS NULL OR t.category_tag_id = ANY(p_tag_ids))
      AND (
        CASE p_assignment_type
          WHEN 'auto' THEN t.assigned_at IS NOT NULL AND t.assigned_by_user_id IS NULL
          WHEN 'manual' THEN t.assigned_by_user_id IS NOT NULL
          ELSE true
        END
      )
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
      -- Records before first cursor
      AND (
        (t.priority < (v_first_cursor->>'priority')::int)
        OR (t.priority = (v_first_cursor->>'priority')::int AND t.opened_at < (v_first_cursor->>'opened_at')::timestamptz)
        OR (t.priority = (v_first_cursor->>'priority')::int AND t.opened_at = (v_first_cursor->>'opened_at')::timestamptz AND t.id < (v_first_cursor->>'id')::uuid)
      )
    LIMIT 1;
    v_has_prev := FOUND;
  ELSE
    v_has_prev := false;
  END IF;

  RETURN jsonb_build_object(
    'tickets', COALESCE(v_rows, '[]'::jsonb),
    'total_count', v_total_count,
    'limit', v_limit,
    'has_next', COALESCE(v_has_next, false),
    'has_prev', COALESCE(v_has_prev, false),
    'next_cursor', v_next_cursor,
    'prev_cursor', v_prev_cursor
  );
END;
$$;