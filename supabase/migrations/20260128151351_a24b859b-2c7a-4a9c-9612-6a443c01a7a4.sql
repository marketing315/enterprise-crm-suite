
-- =====================================================
-- Piano Finale v2: Campi Lead Estesi + Clinical Topics
-- =====================================================

-- 1. Nuovi ENUM Types
CREATE TYPE lead_source_channel AS ENUM ('tv', 'online', 'other');
CREATE TYPE contact_channel AS ENUM ('chat', 'call');
CREATE TYPE pacemaker_status AS ENUM ('assente', 'presente', 'non_chiaro');
CREATE TYPE customer_sentiment AS ENUM ('positivo', 'neutro', 'negativo');
CREATE TYPE decision_status AS ENUM ('pronto', 'indeciso', 'non_interessato');
CREATE TYPE objection_type AS ENUM ('prezzo', 'tempo', 'fiducia', 'altro');
CREATE TYPE appointment_type AS ENUM ('primo_appuntamento', 'follow_up', 'visita_tecnica');
CREATE TYPE topic_created_by AS ENUM ('ai', 'user');

-- 2. Funzione normalize_topic_text (Unicode-Safe)
CREATE OR REPLACE FUNCTION normalize_topic_text(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT lower(
    trim(
      regexp_replace(
        regexp_replace(p_text, '[[:punct:]]', ' ', 'g'),
        '\s+', ' ', 'g'
      )
    )
  )
$$;

-- 3. Tabella clinical_topics (Vocabolario Controllato)
CREATE TABLE public.clinical_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  canonical_name text NOT NULL,
  slug text NOT NULL,
  created_by topic_created_by NOT NULL DEFAULT 'user',
  needs_review boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clinical_topics_brand_slug_unique UNIQUE (brand_id, slug)
);

CREATE INDEX idx_clinical_topics_brand_active ON public.clinical_topics(brand_id, is_active);

-- 4. Tabella clinical_topic_aliases (Mappatura Sinonimi)
CREATE TABLE public.clinical_topic_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  topic_id uuid NOT NULL REFERENCES public.clinical_topics(id) ON DELETE CASCADE,
  alias_text text NOT NULL,
  created_by topic_created_by NOT NULL DEFAULT 'user',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clinical_topic_aliases_brand_alias_unique UNIQUE (brand_id, alias_text)
);

CREATE INDEX idx_clinical_topic_aliases_topic ON public.clinical_topic_aliases(topic_id);

-- Trigger per normalizzare alias_text automaticamente
CREATE OR REPLACE FUNCTION normalize_alias_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.alias_text := normalize_topic_text(NEW.alias_text);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_normalize_alias
BEFORE INSERT OR UPDATE ON public.clinical_topic_aliases
FOR EACH ROW EXECUTE FUNCTION normalize_alias_trigger();

-- 5. Join Table lead_event_clinical_topics
CREATE TABLE public.lead_event_clinical_topics (
  lead_event_id uuid NOT NULL REFERENCES public.lead_events(id) ON DELETE CASCADE,
  topic_id uuid NOT NULL REFERENCES public.clinical_topics(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lead_event_id, topic_id)
);

CREATE INDEX idx_lect_topic_event ON public.lead_event_clinical_topics(topic_id, lead_event_id);
CREATE INDEX idx_lect_event_topic ON public.lead_event_clinical_topics(lead_event_id, topic_id);

-- 6. Nuove colonne su lead_events
ALTER TABLE public.lead_events
  ADD COLUMN IF NOT EXISTS lead_source_channel lead_source_channel,
  ADD COLUMN IF NOT EXISTS contact_channel contact_channel,
  ADD COLUMN IF NOT EXISTS pacemaker_status pacemaker_status,
  ADD COLUMN IF NOT EXISTS customer_sentiment customer_sentiment,
  ADD COLUMN IF NOT EXISTS decision_status decision_status,
  ADD COLUMN IF NOT EXISTS objection_type objection_type,
  ADD COLUMN IF NOT EXISTS booking_notes text,
  ADD COLUMN IF NOT EXISTS ai_conversation_summary text,
  ADD COLUMN IF NOT EXISTS logistics_notes text;

-- 7. Nuova colonna su contacts
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS address text;

-- 8. Nuove colonne su appointments
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS appointment_type appointment_type DEFAULT 'primo_appuntamento',
  ADD COLUMN IF NOT EXISTS appointment_order integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS parent_appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL;

CREATE INDEX idx_appointments_parent ON public.appointments(parent_appointment_id) WHERE parent_appointment_id IS NOT NULL;

-- 9. RLS per clinical_topics
ALTER TABLE public.clinical_topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view topics in their brands"
ON public.clinical_topics FOR SELECT
USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

CREATE POLICY "Admins and CEOs can manage topics"
ON public.clinical_topics FOR ALL
USING (
  has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin') 
  OR has_role(get_user_id(auth.uid()), 'ceo')
)
WITH CHECK (
  has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin') 
  OR has_role(get_user_id(auth.uid()), 'ceo')
);

-- 10. RLS per clinical_topic_aliases
ALTER TABLE public.clinical_topic_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view aliases in their brands"
ON public.clinical_topic_aliases FOR SELECT
USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

CREATE POLICY "Admins and CEOs can manage aliases"
ON public.clinical_topic_aliases FOR ALL
USING (
  has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin') 
  OR has_role(get_user_id(auth.uid()), 'ceo')
)
WITH CHECK (
  has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin') 
  OR has_role(get_user_id(auth.uid()), 'ceo')
);

-- 11. RLS per lead_event_clinical_topics (solo SELECT, write via RPC)
ALTER TABLE public.lead_event_clinical_topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view event topics via lead_events brand"
ON public.lead_event_clinical_topics FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.lead_events le
    WHERE le.id = lead_event_id
    AND user_belongs_to_brand(get_user_id(auth.uid()), le.brand_id)
  )
);

-- 12. RPC upsert_clinical_topics_from_strings
CREATE OR REPLACE FUNCTION upsert_clinical_topics_from_strings(
  p_brand_id uuid,
  p_strings text[],
  p_created_by topic_created_by DEFAULT 'user'
)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_result uuid[] := '{}';
  v_string text;
  v_normalized text;
  v_topic_id uuid;
  v_canonical text;
BEGIN
  -- Validate caller has access to brand
  v_user_id := get_user_id(auth.uid());
  IF v_user_id IS NULL AND current_setting('role', true) != 'service_role' THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  IF v_user_id IS NOT NULL AND NOT user_belongs_to_brand(v_user_id, p_brand_id) THEN
    RAISE EXCEPTION 'Access denied to brand';
  END IF;

  FOREACH v_string IN ARRAY p_strings LOOP
    v_normalized := normalize_topic_text(v_string);
    
    IF v_normalized = '' OR v_normalized IS NULL THEN
      CONTINUE;
    END IF;
    
    -- Check if alias already exists
    SELECT cta.topic_id INTO v_topic_id
    FROM clinical_topic_aliases cta
    WHERE cta.brand_id = p_brand_id AND cta.alias_text = v_normalized;
    
    IF v_topic_id IS NULL THEN
      -- Create new topic with Title Case canonical name
      v_canonical := initcap(v_string);
      
      INSERT INTO clinical_topics (brand_id, canonical_name, slug, created_by, needs_review)
      VALUES (p_brand_id, v_canonical, v_normalized, p_created_by, true)
      ON CONFLICT (brand_id, slug) DO UPDATE SET updated_at = now()
      RETURNING id INTO v_topic_id;
      
      -- Create alias for the new topic
      INSERT INTO clinical_topic_aliases (brand_id, topic_id, alias_text, created_by)
      VALUES (p_brand_id, v_topic_id, v_normalized, p_created_by)
      ON CONFLICT (brand_id, alias_text) DO NOTHING;
    END IF;
    
    v_result := array_append(v_result, v_topic_id);
  END LOOP;
  
  RETURN v_result;
END;
$$;

-- Add updated_at column to clinical_topics for ON CONFLICT
ALTER TABLE public.clinical_topics ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- 13. RPC set_lead_event_clinical_topics
CREATE OR REPLACE FUNCTION set_lead_event_clinical_topics(
  p_event_id uuid,
  p_topic_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_brand_id uuid;
  v_old_topic_ids uuid[];
BEGIN
  v_user_id := get_user_id(auth.uid());
  
  -- Lock the lead event row and get brand_id
  SELECT brand_id INTO v_brand_id
  FROM lead_events
  WHERE id = p_event_id
  FOR UPDATE;
  
  IF v_brand_id IS NULL THEN
    RAISE EXCEPTION 'Lead event not found';
  END IF;
  
  -- Check permissions
  IF v_user_id IS NOT NULL AND NOT (
    has_role_for_brand(v_user_id, v_brand_id, 'admin') OR
    has_role_for_brand(v_user_id, v_brand_id, 'callcenter') OR
    has_role(v_user_id, 'ceo')
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  -- Get old topic IDs for audit
  SELECT array_agg(topic_id) INTO v_old_topic_ids
  FROM lead_event_clinical_topics
  WHERE lead_event_id = p_event_id;
  
  -- Replace all: delete existing, insert new
  DELETE FROM lead_event_clinical_topics WHERE lead_event_id = p_event_id;
  
  IF p_topic_ids IS NOT NULL AND array_length(p_topic_ids, 1) > 0 THEN
    INSERT INTO lead_event_clinical_topics (lead_event_id, topic_id)
    SELECT p_event_id, unnest(p_topic_ids)
    ON CONFLICT DO NOTHING;
  END IF;
  
  -- Audit log
  INSERT INTO audit_log (brand_id, entity_type, entity_id, action, actor_user_id, old_value, new_value)
  VALUES (
    v_brand_id,
    'lead_event',
    p_event_id,
    'topics_updated',
    v_user_id,
    to_jsonb(v_old_topic_ids),
    to_jsonb(p_topic_ids)
  );
END;
$$;

-- 14. RPC add_contact_phone (Pattern Atomico)
CREATE OR REPLACE FUNCTION add_contact_phone(
  p_contact_id uuid,
  p_phone_raw text,
  p_is_primary boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_brand_id uuid;
  v_phone_normalized text;
  v_phone_id uuid;
BEGIN
  v_user_id := get_user_id(auth.uid());
  
  -- Get brand_id from contact
  SELECT brand_id INTO v_brand_id
  FROM contacts
  WHERE id = p_contact_id;
  
  IF v_brand_id IS NULL THEN
    RAISE EXCEPTION 'Contact not found';
  END IF;
  
  -- Check permissions
  IF v_user_id IS NOT NULL AND NOT (
    has_role_for_brand(v_user_id, v_brand_id, 'admin') OR
    has_role_for_brand(v_user_id, v_brand_id, 'callcenter') OR
    has_role(v_user_id, 'ceo')
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  -- Normalize phone (simple version: digits only)
  v_phone_normalized := regexp_replace(p_phone_raw, '[^0-9+]', '', 'g');
  
  -- Try to insert, on conflict get existing
  INSERT INTO contact_phones (brand_id, contact_id, phone_raw, phone_normalized, is_primary)
  VALUES (v_brand_id, p_contact_id, p_phone_raw, v_phone_normalized, false)
  ON CONFLICT (brand_id, phone_normalized) DO UPDATE SET phone_raw = EXCLUDED.phone_raw
  RETURNING id INTO v_phone_id;
  
  -- Handle primary flag
  IF p_is_primary THEN
    UPDATE contact_phones SET is_primary = false
    WHERE contact_id = p_contact_id AND is_primary = true AND id != v_phone_id;
    
    UPDATE contact_phones SET is_primary = true WHERE id = v_phone_id;
  END IF;
  
  RETURN v_phone_id;
END;
$$;

-- 15. Update search_lead_events to support clinical_topic_ids filter
CREATE OR REPLACE FUNCTION search_lead_events(
  p_brand_id uuid,
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL,
  p_source lead_source_type DEFAULT NULL,
  p_source_name text DEFAULT NULL,
  p_priority_min integer DEFAULT NULL,
  p_priority_max integer DEFAULT NULL,
  p_tag_ids uuid[] DEFAULT NULL,
  p_match_all_tags boolean DEFAULT false,
  p_include_archived boolean DEFAULT false,
  p_archived boolean DEFAULT NULL,
  p_clinical_topic_ids uuid[] DEFAULT NULL,
  p_match_all_topics boolean DEFAULT false,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result json;
  v_total bigint;
BEGIN
  -- Get total count
  SELECT COUNT(*) INTO v_total
  FROM lead_events le
  WHERE le.brand_id = p_brand_id
    AND (p_date_from IS NULL OR le.received_at >= p_date_from)
    AND (p_date_to IS NULL OR le.received_at <= p_date_to)
    AND (p_source IS NULL OR le.source = p_source)
    AND (p_source_name IS NULL OR le.source_name ILIKE '%' || p_source_name || '%')
    AND (p_priority_min IS NULL OR le.ai_priority >= p_priority_min)
    AND (p_priority_max IS NULL OR le.ai_priority <= p_priority_max)
    AND (p_include_archived OR le.archived = false)
    AND (p_archived IS NULL OR le.archived = p_archived)
    AND (p_tag_ids IS NULL OR array_length(p_tag_ids, 1) IS NULL OR (
      CASE WHEN p_match_all_tags THEN
        (SELECT COUNT(DISTINCT ta.tag_id) FROM tag_assignments ta 
         WHERE ta.lead_event_id = le.id AND ta.tag_id = ANY(p_tag_ids)) = array_length(p_tag_ids, 1)
      ELSE
        EXISTS (SELECT 1 FROM tag_assignments ta 
                WHERE ta.lead_event_id = le.id AND ta.tag_id = ANY(p_tag_ids))
      END
    ))
    AND (p_clinical_topic_ids IS NULL OR array_length(p_clinical_topic_ids, 1) IS NULL OR (
      CASE WHEN p_match_all_topics THEN
        (SELECT COUNT(DISTINCT lect.topic_id) FROM lead_event_clinical_topics lect 
         WHERE lect.lead_event_id = le.id AND lect.topic_id = ANY(p_clinical_topic_ids)) = array_length(p_clinical_topic_ids, 1)
      ELSE
        EXISTS (SELECT 1 FROM lead_event_clinical_topics lect 
                WHERE lect.lead_event_id = le.id AND lect.topic_id = ANY(p_clinical_topic_ids))
      END
    ));

  -- Get paginated results
  SELECT json_build_object(
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset,
    'events', COALESCE((
      SELECT json_agg(row_to_json(t))
      FROM (
        SELECT 
          le.id,
          le.brand_id,
          le.contact_id,
          le.deal_id,
          le.source,
          le.source_name,
          le.raw_payload,
          le.occurred_at,
          le.received_at,
          le.ai_priority,
          le.ai_confidence,
          le.ai_rationale,
          le.ai_processed,
          le.lead_type,
          le.archived,
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
          (SELECT json_agg(json_build_object('id', ct.id, 'canonical_name', ct.canonical_name, 'needs_review', ct.needs_review))
           FROM lead_event_clinical_topics lect
           JOIN clinical_topics ct ON ct.id = lect.topic_id
           WHERE lect.lead_event_id = le.id) AS clinical_topics,
          (SELECT json_build_object(
            'id', c.id,
            'first_name', c.first_name,
            'last_name', c.last_name,
            'email', c.email,
            'primary_phone', (SELECT cp.phone_raw FROM contact_phones cp WHERE cp.contact_id = c.id AND cp.is_primary LIMIT 1)
          ) FROM contacts c WHERE c.id = le.contact_id) AS contact
        FROM lead_events le
        WHERE le.brand_id = p_brand_id
          AND (p_date_from IS NULL OR le.received_at >= p_date_from)
          AND (p_date_to IS NULL OR le.received_at <= p_date_to)
          AND (p_source IS NULL OR le.source = p_source)
          AND (p_source_name IS NULL OR le.source_name ILIKE '%' || p_source_name || '%')
          AND (p_priority_min IS NULL OR le.ai_priority >= p_priority_min)
          AND (p_priority_max IS NULL OR le.ai_priority <= p_priority_max)
          AND (p_include_archived OR le.archived = false)
          AND (p_archived IS NULL OR le.archived = p_archived)
          AND (p_tag_ids IS NULL OR array_length(p_tag_ids, 1) IS NULL OR (
            CASE WHEN p_match_all_tags THEN
              (SELECT COUNT(DISTINCT ta.tag_id) FROM tag_assignments ta 
               WHERE ta.lead_event_id = le.id AND ta.tag_id = ANY(p_tag_ids)) = array_length(p_tag_ids, 1)
            ELSE
              EXISTS (SELECT 1 FROM tag_assignments ta 
                      WHERE ta.lead_event_id = le.id AND ta.tag_id = ANY(p_tag_ids))
            END
          ))
          AND (p_clinical_topic_ids IS NULL OR array_length(p_clinical_topic_ids, 1) IS NULL OR (
            CASE WHEN p_match_all_topics THEN
              (SELECT COUNT(DISTINCT lect.topic_id) FROM lead_event_clinical_topics lect 
               WHERE lect.lead_event_id = le.id AND lect.topic_id = ANY(p_clinical_topic_ids)) = array_length(p_clinical_topic_ids, 1)
            ELSE
              EXISTS (SELECT 1 FROM lead_event_clinical_topics lect 
                      WHERE lect.lead_event_id = le.id AND lect.topic_id = ANY(p_clinical_topic_ids))
            END
          ))
        ORDER BY le.received_at DESC
        LIMIT p_limit
        OFFSET p_offset
      ) t
    ), '[]'::json)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- 16. Update search_appointments to include brand_name
CREATE OR REPLACE FUNCTION search_appointments(
  p_brand_id uuid,
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL,
  p_status appointment_status DEFAULT NULL,
  p_sales_user_id uuid DEFAULT NULL,
  p_contact_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result json;
  v_total bigint;
BEGIN
  SELECT COUNT(*) INTO v_total
  FROM appointments a
  WHERE a.brand_id = p_brand_id
    AND (p_date_from IS NULL OR a.scheduled_at >= p_date_from)
    AND (p_date_to IS NULL OR a.scheduled_at <= p_date_to)
    AND (p_status IS NULL OR a.status = p_status)
    AND (p_sales_user_id IS NULL OR a.assigned_sales_user_id = p_sales_user_id)
    AND (p_contact_id IS NULL OR a.contact_id = p_contact_id);

  SELECT json_build_object(
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset,
    'appointments', COALESCE((
      SELECT json_agg(row_to_json(t))
      FROM (
        SELECT 
          a.id,
          a.brand_id,
          b.name AS brand_name,
          a.contact_id,
          a.deal_id,
          a.scheduled_at,
          a.duration_minutes,
          a.address,
          a.city,
          a.cap,
          a.notes,
          a.status,
          a.appointment_type,
          a.appointment_order,
          a.parent_appointment_id,
          a.assigned_sales_user_id,
          a.created_at,
          a.updated_at,
          json_build_object(
            'id', c.id,
            'first_name', c.first_name,
            'last_name', c.last_name,
            'email', c.email,
            'primary_phone', (SELECT cp.phone_raw FROM contact_phones cp WHERE cp.contact_id = c.id AND cp.is_primary LIMIT 1)
          ) AS contact,
          CASE WHEN a.assigned_sales_user_id IS NOT NULL THEN
            json_build_object(
              'id', u.id,
              'full_name', u.full_name,
              'email', u.email
            )
          ELSE NULL END AS sales_user
        FROM appointments a
        JOIN brands b ON b.id = a.brand_id
        JOIN contacts c ON c.id = a.contact_id
        LEFT JOIN users u ON u.id = a.assigned_sales_user_id
        WHERE a.brand_id = p_brand_id
          AND (p_date_from IS NULL OR a.scheduled_at >= p_date_from)
          AND (p_date_to IS NULL OR a.scheduled_at <= p_date_to)
          AND (p_status IS NULL OR a.status = p_status)
          AND (p_sales_user_id IS NULL OR a.assigned_sales_user_id = p_sales_user_id)
          AND (p_contact_id IS NULL OR a.contact_id = p_contact_id)
        ORDER BY a.scheduled_at ASC
        LIMIT p_limit
        OFFSET p_offset
      ) t
    ), '[]'::json)
  ) INTO v_result;

  RETURN v_result;
END;
$$;
