-- ============================================================
-- HOTFIX: secure search_lead_events
-- Drop all existing versions and create secured one
-- ============================================================

-- Drop existing versions (different signatures)
DROP FUNCTION IF EXISTS public.search_lead_events(
  uuid, timestamptz, timestamptz, text, text, boolean, boolean, uuid[], boolean, integer, integer, integer, integer
);

DROP FUNCTION IF EXISTS public.search_lead_events(
  uuid, timestamptz, timestamptz, lead_source_type, text, integer, integer, uuid[], boolean, boolean, boolean, uuid[], boolean, integer, integer
);

-- Create secured version
CREATE OR REPLACE FUNCTION public.search_lead_events(
  p_brand_id uuid,
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_source_name text DEFAULT NULL,
  p_include_archived boolean DEFAULT FALSE,
  p_tag_ids uuid[] DEFAULT NULL,
  p_match_all_tags boolean DEFAULT FALSE,
  p_priority_min int DEFAULT NULL,
  p_priority_max int DEFAULT NULL,
  p_clinical_topic_ids uuid[] DEFAULT NULL,
  p_match_all_topics boolean DEFAULT FALSE,
  p_limit int DEFAULT 100,
  p_offset int DEFAULT 0
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result json;
  v_user_id uuid;
  v_user_role app_role;
  v_tag_count int;
  v_topic_count int;
BEGIN
  -- Resolve app user
  v_user_id := get_user_id(auth.uid());
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Brand access check (CRITICAL)
  IF NOT user_belongs_to_brand(v_user_id, p_brand_id) THEN
    RAISE EXCEPTION 'Forbidden: no access to brand';
  END IF;

  -- Role check for archived visibility
  SELECT ur.role INTO v_user_role
  FROM public.user_roles ur
  WHERE ur.user_id = v_user_id AND ur.brand_id = p_brand_id
  LIMIT 1;

  IF COALESCE(p_include_archived, FALSE) = TRUE THEN
    IF v_user_role IS NULL OR v_user_role NOT IN ('admin', 'ceo') THEN
      RAISE EXCEPTION 'Forbidden: include_archived requires admin/ceo';
    END IF;
  END IF;

  v_tag_count := COALESCE(array_length(p_tag_ids, 1), 0);
  v_topic_count := COALESCE(array_length(p_clinical_topic_ids, 1), 0);

  WITH filtered_events AS (
    SELECT
      le.*,
      -- Contact snapshot
      jsonb_build_object(
        'id', c.id,
        'first_name', c.first_name,
        'last_name', c.last_name,
        'email', c.email,
        'status', c.status,
        'primary_phone', (
          SELECT cp.phone_raw
          FROM public.contact_phones cp
          WHERE cp.contact_id = c.id AND cp.is_primary = true
          LIMIT 1
        )
      ) AS contact,
      -- Tags
      COALESCE(
        (
          SELECT jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color, 'scope', t.scope))
          FROM public.tag_assignments ta
          JOIN public.tags t ON t.id = ta.tag_id
          WHERE ta.lead_event_id = le.id
        ),
        '[]'::jsonb
      ) AS tags
    FROM public.lead_events le
    LEFT JOIN public.contacts c ON c.id = le.contact_id
    WHERE le.brand_id = p_brand_id
      AND (p_date_from IS NULL OR le.received_at >= p_date_from)
      AND (p_date_to IS NULL OR le.received_at <= p_date_to)
      AND (p_source IS NULL OR le.source::text = p_source)
      AND (p_source_name IS NULL OR le.source_name = p_source_name)
      AND (p_include_archived = TRUE OR le.archived = FALSE)
      AND (p_priority_min IS NULL OR le.ai_priority >= p_priority_min)
      AND (p_priority_max IS NULL OR le.ai_priority <= p_priority_max)
      -- Tag filter
      AND (
        v_tag_count = 0
        OR (
          p_match_all_tags = FALSE AND EXISTS (
            SELECT 1 FROM public.tag_assignments ta
            WHERE ta.lead_event_id = le.id AND ta.tag_id = ANY(p_tag_ids)
          )
        )
        OR (
          p_match_all_tags = TRUE AND (
            SELECT COUNT(DISTINCT ta.tag_id)
            FROM public.tag_assignments ta
            WHERE ta.lead_event_id = le.id AND ta.tag_id = ANY(p_tag_ids)
          ) = v_tag_count
        )
      )
      -- Clinical topic filter
      AND (
        v_topic_count = 0
        OR (
          p_match_all_topics = FALSE AND EXISTS (
            SELECT 1 FROM public.lead_event_clinical_topics lect
            WHERE lect.lead_event_id = le.id AND lect.topic_id = ANY(p_clinical_topic_ids)
          )
        )
        OR (
          p_match_all_topics = TRUE AND (
            SELECT COUNT(DISTINCT lect.topic_id)
            FROM public.lead_event_clinical_topics lect
            WHERE lect.lead_event_id = le.id AND lect.topic_id = ANY(p_clinical_topic_ids)
          ) = v_topic_count
        )
      )
    ORDER BY le.received_at DESC
  ),
  counted AS (
    SELECT COUNT(*) AS total FROM filtered_events
  ),
  paginated AS (
    SELECT * FROM filtered_events
    LIMIT p_limit OFFSET p_offset
  )
  SELECT jsonb_build_object(
    'total', (SELECT total FROM counted),
    'limit', p_limit,
    'offset', p_offset,
    'events', COALESCE((SELECT jsonb_agg(row_to_json(p.*)) FROM paginated p), '[]'::jsonb)
  )::json
  INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_lead_events TO authenticated;