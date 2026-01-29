-- ============================================================
-- CLEANUP: Drop all overloads of search_lead_events and recreate ONE canonical version
-- ============================================================

-- 1) DROP all overloads of public.search_lead_events (any signature)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT
      n.nspname AS schema_name,
      p.proname AS func_name,
      pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'search_lead_events'
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %I.%I(%s);', r.schema_name, r.func_name, r.args);
  END LOOP;
END $$;

-- 2) Recreate ONE canonical version with:
--    - Role check for p_include_archived (admin/ceo only)
--    - Tag filters (ANY/ALL)
--    - Clinical topics filters (ANY/ALL)
--    - SECURITY DEFINER + SET search_path=public
CREATE OR REPLACE FUNCTION public.search_lead_events(
  p_brand_id uuid,
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_source_name text DEFAULT NULL,
  p_include_archived boolean DEFAULT false,
  p_tag_ids uuid[] DEFAULT NULL,
  p_match_all_tags boolean DEFAULT false,
  p_priority_min int DEFAULT NULL,
  p_priority_max int DEFAULT NULL,
  p_clinical_topic_ids uuid[] DEFAULT NULL,
  p_match_all_topics boolean DEFAULT false,
  p_limit int DEFAULT 100,
  p_offset int DEFAULT 0
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
  v_tag_count INTEGER;
  v_topic_count INTEGER;
  v_user_id uuid;
  v_user_role app_role;
BEGIN
  -- Get current user
  SELECT u.id INTO v_user_id
  FROM public.users u
  WHERE u.supabase_auth_id = auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: no application user found';
  END IF;
  
  -- Check user has access to brand
  IF NOT user_belongs_to_brand(v_user_id, p_brand_id) THEN
    RAISE EXCEPTION 'Forbidden: no access to this brand';
  END IF;
  
  -- Get user role for this brand
  SELECT ur.role INTO v_user_role
  FROM public.user_roles ur
  WHERE ur.user_id = v_user_id AND ur.brand_id = p_brand_id
  LIMIT 1;
  
  -- Enforce archived visibility restriction (admin/ceo only)
  IF p_include_archived = TRUE AND v_user_role NOT IN ('admin', 'ceo') THEN
    RAISE EXCEPTION 'Forbidden: archived visibility requires admin or ceo role';
  END IF;
  
  v_tag_count := COALESCE(array_length(p_tag_ids, 1), 0);
  v_topic_count := COALESCE(array_length(p_clinical_topic_ids, 1), 0);
  
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
      le.lead_source_channel,
      le.contact_channel,
      le.pacemaker_status,
      le.customer_sentiment,
      le.decision_status,
      le.objection_type,
      le.booking_notes,
      le.ai_conversation_summary,
      le.logistics_notes,
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
      -- Tags array
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
      ) AS tags,
      -- Clinical topics array
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', ct.id,
              'canonical_name', ct.canonical_name,
              'needs_review', ct.needs_review
            )
          )
          FROM lead_event_clinical_topics lect
          JOIN clinical_topics ct ON ct.id = lect.topic_id
          WHERE lect.lead_event_id = le.id
        ),
        '[]'::jsonb
      ) AS clinical_topics
    FROM lead_events le
    LEFT JOIN contacts c ON c.id = le.contact_id
    WHERE le.brand_id = p_brand_id
      AND (p_date_from IS NULL OR le.received_at >= p_date_from)
      AND (p_date_to IS NULL OR le.received_at <= p_date_to)
      AND (p_source IS NULL OR le.source::text = p_source)
      AND (p_source_name IS NULL OR le.source_name ILIKE '%' || p_source_name || '%')
      AND (p_include_archived = TRUE OR le.archived = FALSE)
      AND (p_priority_min IS NULL OR le.ai_priority >= p_priority_min)
      AND (p_priority_max IS NULL OR le.ai_priority <= p_priority_max)
      -- Tag filter
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
      -- Clinical topics filter
      AND (
        v_topic_count = 0 
        OR (
          p_match_all_topics = FALSE AND EXISTS (
            SELECT 1 FROM lead_event_clinical_topics lect
            WHERE lect.lead_event_id = le.id AND lect.topic_id = ANY(p_clinical_topic_ids)
          )
        )
        OR (
          p_match_all_topics = TRUE AND (
            SELECT COUNT(DISTINCT lect.topic_id) 
            FROM lead_event_clinical_topics lect
            WHERE lect.lead_event_id = le.id AND lect.topic_id = ANY(p_clinical_topic_ids)
          ) = v_topic_count
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

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.search_lead_events TO authenticated;