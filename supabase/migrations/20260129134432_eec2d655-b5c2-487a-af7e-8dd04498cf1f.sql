-- Drop ALL overloads of public.search_lead_events safely
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'search_lead_events'
  LOOP
    EXECUTE format(
      'DROP FUNCTION IF EXISTS public.search_lead_events(%s);',
      pg_get_function_identity_arguments(r.oid)
    );
  END LOOP;
END $$;

-- Recreate ONE canonical version with full security + filtering
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
  v_user_id uuid;
  v_user_role app_role;
  v_result json;
  v_tag_count int := COALESCE(array_length(p_tag_ids, 1), 0);
  v_topic_count int := COALESCE(array_length(p_clinical_topic_ids, 1), 0);
BEGIN
  -- Resolve app user from auth
  SELECT u.id INTO v_user_id
  FROM public.users u
  WHERE u.supabase_auth_id = auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Brand access check
  IF NOT user_belongs_to_brand(v_user_id, p_brand_id) THEN
    RAISE EXCEPTION 'Forbidden: no access to brand';
  END IF;

  -- Role check for include_archived
  IF p_include_archived = TRUE THEN
    SELECT ur.role INTO v_user_role
    FROM public.user_roles ur
    WHERE ur.user_id = v_user_id AND ur.brand_id = p_brand_id
    LIMIT 1;

    IF v_user_role IS NULL OR v_user_role NOT IN ('admin', 'ceo') THEN
      RAISE EXCEPTION 'Forbidden: include_archived requires admin/ceo';
    END IF;
  END IF;

  -- Main query with all filters
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
      le.lead_source_channel,
      le.contact_channel,
      le.pacemaker_status,
      le.customer_sentiment,
      le.decision_status,
      le.objection_type,
      le.booking_notes,
      le.logistics_notes,
      le.ai_conversation_summary
    FROM public.lead_events le
    WHERE le.brand_id = p_brand_id
      -- Archived filter
      AND (p_include_archived = TRUE OR le.archived = FALSE)
      -- Date filters
      AND (p_date_from IS NULL OR le.received_at >= p_date_from)
      AND (p_date_to IS NULL OR le.received_at <= p_date_to)
      -- Source filters
      AND (p_source IS NULL OR le.source::text = p_source)
      AND (p_source_name IS NULL OR le.source_name ILIKE '%' || p_source_name || '%')
      -- Priority filters
      AND (p_priority_min IS NULL OR le.ai_priority >= p_priority_min)
      AND (p_priority_max IS NULL OR le.ai_priority <= p_priority_max)
      -- Tag filter (ANY mode)
      AND (
        v_tag_count = 0
        OR (
          p_match_all_tags = FALSE
          AND EXISTS (
            SELECT 1 FROM public.tag_assignments ta
            WHERE ta.lead_event_id = le.id
              AND ta.tag_id = ANY(p_tag_ids)
          )
        )
        OR (
          p_match_all_tags = TRUE
          AND (
            SELECT COUNT(DISTINCT ta.tag_id)
            FROM public.tag_assignments ta
            WHERE ta.lead_event_id = le.id
              AND ta.tag_id = ANY(p_tag_ids)
          ) = v_tag_count
        )
      )
      -- Clinical topics filter
      AND (
        v_topic_count = 0
        OR (
          p_match_all_topics = FALSE
          AND EXISTS (
            SELECT 1 FROM public.lead_event_clinical_topics lect
            WHERE lect.lead_event_id = le.id
              AND lect.topic_id = ANY(p_clinical_topic_ids)
          )
        )
        OR (
          p_match_all_topics = TRUE
          AND (
            SELECT COUNT(DISTINCT lect.topic_id)
            FROM public.lead_event_clinical_topics lect
            WHERE lect.lead_event_id = le.id
              AND lect.topic_id = ANY(p_clinical_topic_ids)
          ) = v_topic_count
        )
      )
  ),
  counted AS (
    SELECT COUNT(*) AS total FROM filtered_events
  ),
  paginated AS (
    SELECT fe.*
    FROM filtered_events fe
    ORDER BY fe.received_at DESC
    LIMIT p_limit OFFSET p_offset
  ),
  with_relations AS (
    SELECT
      p.id,
      p.brand_id,
      p.contact_id,
      p.deal_id,
      p.source,
      p.source_name,
      p.occurred_at,
      p.received_at,
      p.ai_priority,
      p.ai_confidence,
      p.ai_rationale,
      p.lead_type,
      p.archived,
      p.raw_payload,
      p.created_at,
      p.lead_source_channel,
      p.contact_channel,
      p.pacemaker_status,
      p.customer_sentiment,
      p.decision_status,
      p.objection_type,
      p.booking_notes,
      p.logistics_notes,
      p.ai_conversation_summary,
      -- Contact snapshot
      jsonb_build_object(
        'id', c.id,
        'first_name', c.first_name,
        'last_name', c.last_name,
        'email', c.email,
        'status', c.status,
        'primary_phone', (
          SELECT cp.phone_normalized
          FROM public.contact_phones cp
          WHERE cp.contact_id = c.id AND cp.is_primary = TRUE
          LIMIT 1
        )
      ) AS contact,
      -- Tags array
      COALESCE(
        (
          SELECT jsonb_agg(jsonb_build_object(
            'id', t.id,
            'name', t.name,
            'color', t.color,
            'scope', t.scope
          ))
          FROM public.tag_assignments ta
          JOIN public.tags t ON t.id = ta.tag_id
          WHERE ta.lead_event_id = p.id
        ),
        '[]'::jsonb
      ) AS tags,
      -- Clinical topics array
      COALESCE(
        (
          SELECT jsonb_agg(jsonb_build_object(
            'id', ct.id,
            'canonical_name', ct.canonical_name,
            'slug', ct.slug,
            'needs_review', ct.needs_review
          ))
          FROM public.lead_event_clinical_topics lect
          JOIN public.clinical_topics ct ON ct.id = lect.topic_id
          WHERE lect.lead_event_id = p.id
        ),
        '[]'::jsonb
      ) AS clinical_topics
    FROM paginated p
    LEFT JOIN public.contacts c ON c.id = p.contact_id
  )
  SELECT json_build_object(
    'total', (SELECT total FROM counted),
    'limit', p_limit,
    'offset', p_offset,
    'events', COALESCE(
      (SELECT json_agg(row_to_json(wr)) FROM with_relations wr),
      '[]'::json
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.search_lead_events(
  uuid, timestamptz, timestamptz, text, text, boolean,
  uuid[], boolean, int, int, uuid[], boolean, int, int
) TO authenticated;