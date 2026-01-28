-- STEP 2A: Indexes for tag filtering + lead_events/deals search
-- STEP 2B: Index for archived filtering

-- 1) Indexes for tag_assignments performance
CREATE INDEX IF NOT EXISTS ix_tag_assignments_brand_tag
ON tag_assignments (brand_id, tag_id);

CREATE INDEX IF NOT EXISTS ix_tag_assignments_lead_event
ON tag_assignments (brand_id, lead_event_id) WHERE lead_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_tag_assignments_deal
ON tag_assignments (brand_id, deal_id) WHERE deal_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_tag_assignments_contact
ON tag_assignments (brand_id, contact_id) WHERE contact_id IS NOT NULL;

-- 2) Indexes for lead_events search
CREATE INDEX IF NOT EXISTS ix_lead_events_brand_occurred
ON lead_events (brand_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS ix_lead_events_brand_received
ON lead_events (brand_id, received_at DESC);

CREATE INDEX IF NOT EXISTS ix_lead_events_brand_archived
ON lead_events (brand_id, archived);

CREATE INDEX IF NOT EXISTS ix_lead_events_brand_source
ON lead_events (brand_id, source);

-- 3) Indexes for deals search
CREATE INDEX IF NOT EXISTS ix_deals_brand_updated
ON deals (brand_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS ix_deals_brand_status
ON deals (brand_id, status);

-- 4) RPC: search_lead_events - Server-side filtering with tag support
CREATE OR REPLACE FUNCTION public.search_lead_events(
  p_brand_id UUID,
  p_date_from TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_date_to TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_source TEXT DEFAULT NULL,
  p_source_name TEXT DEFAULT NULL,
  p_archived BOOLEAN DEFAULT FALSE, -- false = hide archived, true = show all
  p_include_archived BOOLEAN DEFAULT FALSE, -- if true, show archived (requires admin/ceo)
  p_tag_ids UUID[] DEFAULT NULL,
  p_match_all_tags BOOLEAN DEFAULT FALSE, -- false = ANY, true = ALL
  p_priority_min INTEGER DEFAULT NULL,
  p_priority_max INTEGER DEFAULT NULL,
  p_limit INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
  v_total BIGINT;
  v_events JSON;
  v_tag_count INTEGER;
BEGIN
  v_tag_count := COALESCE(array_length(p_tag_ids, 1), 0);
  
  -- Build the query with all filters
  WITH filtered_events AS (
    SELECT 
      le.id,
      le.brand_id,
      le.contact_id,
      le.deal_id,
      le.source,
      le.source_name,
      le.occurred_at,
      le.received_at,
      le.ai_priority,
      le.ai_confidence,
      le.ai_rationale,
      le.lead_type,
      le.archived,
      le.raw_payload,
      le.created_at,
      -- Contact snapshot
      jsonb_build_object(
        'id', c.id,
        'first_name', c.first_name,
        'last_name', c.last_name,
        'email', c.email,
        'status', c.status,
        'primary_phone', (
          SELECT cp.phone_raw 
          FROM contact_phones cp 
          WHERE cp.contact_id = c.id AND cp.is_primary = true 
          LIMIT 1
        )
      ) AS contact,
      -- Tags for this event
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', t.id,
              'name', t.name,
              'color', t.color,
              'scope', t.scope
            )
          )
          FROM tag_assignments ta
          JOIN tags t ON t.id = ta.tag_id
          WHERE ta.lead_event_id = le.id
        ),
        '[]'::jsonb
      ) AS tags
    FROM lead_events le
    LEFT JOIN contacts c ON c.id = le.contact_id
    WHERE le.brand_id = p_brand_id
      -- Date filters
      AND (p_date_from IS NULL OR le.received_at >= p_date_from)
      AND (p_date_to IS NULL OR le.received_at <= p_date_to)
      -- Source filter
      AND (p_source IS NULL OR le.source::text = p_source)
      AND (p_source_name IS NULL OR le.source_name = p_source_name)
      -- Archived filter (default: hide archived)
      AND (p_include_archived = TRUE OR le.archived = FALSE)
      -- Priority filters
      AND (p_priority_min IS NULL OR le.ai_priority >= p_priority_min)
      AND (p_priority_max IS NULL OR le.ai_priority <= p_priority_max)
      -- Tag filter (if provided)
      AND (
        v_tag_count = 0 
        OR (
          p_match_all_tags = FALSE AND EXISTS (
            SELECT 1 FROM tag_assignments ta
            WHERE ta.lead_event_id = le.id AND ta.tag_id = ANY(p_tag_ids)
          )
        )
        OR (
          p_match_all_tags = TRUE AND (
            SELECT COUNT(DISTINCT ta.tag_id) 
            FROM tag_assignments ta
            WHERE ta.lead_event_id = le.id AND ta.tag_id = ANY(p_tag_ids)
          ) = v_tag_count
        )
      )
    ORDER BY le.received_at DESC
  ),
  counted AS (
    SELECT COUNT(*) as total FROM filtered_events
  ),
  paginated AS (
    SELECT * FROM filtered_events
    LIMIT p_limit OFFSET p_offset
  )
  SELECT 
    jsonb_build_object(
      'total', (SELECT total FROM counted),
      'limit', p_limit,
      'offset', p_offset,
      'events', COALESCE((SELECT jsonb_agg(row_to_json(p.*)) FROM paginated p), '[]'::jsonb)
    )::json
  INTO v_result;
  
  RETURN v_result;
END;
$$;

-- 5) RPC: search_deals - Server-side filtering with tag support for Kanban
CREATE OR REPLACE FUNCTION public.search_deals(
  p_brand_id UUID,
  p_status TEXT DEFAULT 'open',
  p_stage_ids UUID[] DEFAULT NULL,
  p_tag_ids UUID[] DEFAULT NULL,
  p_match_all_tags BOOLEAN DEFAULT FALSE,
  p_date_from TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_date_to TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_limit INTEGER DEFAULT 500,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
  v_tag_count INTEGER;
BEGIN
  v_tag_count := COALESCE(array_length(p_tag_ids, 1), 0);
  
  WITH filtered_deals AS (
    SELECT 
      d.id,
      d.brand_id,
      d.contact_id,
      d.current_stage_id,
      d.status,
      d.value,
      d.notes,
      d.created_at,
      d.updated_at,
      d.closed_at,
      -- Contact snapshot
      jsonb_build_object(
        'id', c.id,
        'first_name', c.first_name,
        'last_name', c.last_name,
        'email', c.email
      ) AS contact,
      -- Tags for this deal
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', t.id,
              'name', t.name,
              'color', t.color
            )
          )
          FROM tag_assignments ta
          JOIN tags t ON t.id = ta.tag_id
          WHERE ta.deal_id = d.id
        ),
        '[]'::jsonb
      ) AS tags
    FROM deals d
    LEFT JOIN contacts c ON c.id = d.contact_id
    WHERE d.brand_id = p_brand_id
      -- Status filter
      AND (p_status IS NULL OR d.status::text = p_status)
      -- Stage filter
      AND (p_stage_ids IS NULL OR array_length(p_stage_ids, 1) IS NULL OR d.current_stage_id = ANY(p_stage_ids))
      -- Date filters
      AND (p_date_from IS NULL OR d.created_at >= p_date_from)
      AND (p_date_to IS NULL OR d.created_at <= p_date_to)
      -- Tag filter
      AND (
        v_tag_count = 0 
        OR (
          p_match_all_tags = FALSE AND EXISTS (
            SELECT 1 FROM tag_assignments ta
            WHERE ta.deal_id = d.id AND ta.tag_id = ANY(p_tag_ids)
          )
        )
        OR (
          p_match_all_tags = TRUE AND (
            SELECT COUNT(DISTINCT ta.tag_id) 
            FROM tag_assignments ta
            WHERE ta.deal_id = d.id AND ta.tag_id = ANY(p_tag_ids)
          ) = v_tag_count
        )
      )
    ORDER BY d.updated_at DESC
  ),
  counted AS (
    SELECT COUNT(*) as total FROM filtered_deals
  ),
  paginated AS (
    SELECT * FROM filtered_deals
    LIMIT p_limit OFFSET p_offset
  )
  SELECT 
    jsonb_build_object(
      'total', (SELECT total FROM counted),
      'limit', p_limit,
      'offset', p_offset,
      'deals', COALESCE((SELECT jsonb_agg(row_to_json(p.*)) FROM paginated p), '[]'::jsonb)
    )::json
  INTO v_result;
  
  RETURN v_result;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.search_lead_events TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_deals TO authenticated;