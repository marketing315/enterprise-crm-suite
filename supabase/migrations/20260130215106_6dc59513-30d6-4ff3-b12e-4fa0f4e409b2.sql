-- =====================================================
-- Full-text Contact Search Enhancement
-- =====================================================

-- 1. Update build_contact_search_text() to include address and notes
CREATE OR REPLACE FUNCTION public.build_contact_search_text(p_contact_id UUID)
RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_text TEXT := '';
  v_contact RECORD;
BEGIN
  SELECT c.first_name, c.last_name, c.email, c.city, c.cap, 
         c.address, c.notes, b.name as brand_name
  INTO v_contact FROM contacts c 
  LEFT JOIN brands b ON b.id = c.brand_id 
  WHERE c.id = p_contact_id;
  
  IF v_contact IS NULL THEN RETURN ''; END IF;
  
  v_text := COALESCE(v_contact.first_name, '') || ' ' || 
            COALESCE(v_contact.last_name, '') || ' ' ||
            COALESCE(v_contact.email, '') || ' ' || 
            COALESCE(v_contact.city, '') || ' ' ||
            COALESCE(v_contact.cap, '') || ' ' || 
            COALESCE(v_contact.address, '') || ' ' ||
            COALESCE(v_contact.notes, '') || ' ' ||
            COALESCE(v_contact.brand_name, '');
  
  -- Telefoni
  v_text := v_text || ' ' || COALESCE((
    SELECT string_agg(phone_normalized, ' ') 
    FROM contact_phones WHERE contact_id = p_contact_id AND is_active
  ), '');
  
  -- Tag
  v_text := v_text || ' ' || COALESCE((
    SELECT string_agg(t.name, ' ') 
    FROM tag_assignments ta JOIN tags t ON t.id = ta.tag_id 
    WHERE ta.contact_id = p_contact_id
  ), '');
  
  -- Custom fields
  v_text := v_text || ' ' || COALESCE((
    SELECT string_agg(value_text, ' ') 
    FROM contact_field_values WHERE contact_id = p_contact_id AND value_text IS NOT NULL
  ), '');
  
  RETURN lower(regexp_replace(trim(v_text), '\s+', ' ', 'g'));
END;
$$;

-- 2. Add triggers for related tables

-- Trigger function for contact_phones
CREATE OR REPLACE FUNCTION public.trigger_phone_search_sync() 
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.update_contact_search_index(OLD.contact_id);
    RETURN OLD;
  ELSE
    PERFORM public.update_contact_search_index(NEW.contact_id);
    RETURN NEW;
  END IF;
END; $$;

DROP TRIGGER IF EXISTS trg_phone_search_sync ON public.contact_phones;
CREATE TRIGGER trg_phone_search_sync 
  AFTER INSERT OR UPDATE OR DELETE ON public.contact_phones 
  FOR EACH ROW EXECUTE FUNCTION public.trigger_phone_search_sync();

-- Trigger function for tag_assignments
CREATE OR REPLACE FUNCTION public.trigger_tag_search_sync() 
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.contact_id IS NOT NULL THEN
      PERFORM public.update_contact_search_index(OLD.contact_id);
    END IF;
    RETURN OLD;
  ELSE
    IF NEW.contact_id IS NOT NULL THEN
      PERFORM public.update_contact_search_index(NEW.contact_id);
    END IF;
    RETURN NEW;
  END IF;
END; $$;

DROP TRIGGER IF EXISTS trg_tag_search_sync ON public.tag_assignments;
CREATE TRIGGER trg_tag_search_sync 
  AFTER INSERT OR DELETE ON public.tag_assignments 
  FOR EACH ROW EXECUTE FUNCTION public.trigger_tag_search_sync();

-- Trigger function for contact_field_values
CREATE OR REPLACE FUNCTION public.trigger_field_values_search_sync() 
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.update_contact_search_index(OLD.contact_id);
    RETURN OLD;
  ELSE
    PERFORM public.update_contact_search_index(NEW.contact_id);
    RETURN NEW;
  END IF;
END; $$;

DROP TRIGGER IF EXISTS trg_field_values_search_sync ON public.contact_field_values;
CREATE TRIGGER trg_field_values_search_sync 
  AFTER INSERT OR UPDATE OR DELETE ON public.contact_field_values 
  FOR EACH ROW EXECUTE FUNCTION public.trigger_field_values_search_sync();

-- 3. Drop existing search_contacts overloads to prevent ambiguity
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT oid::regprocedure::text as sig
    FROM pg_proc
    WHERE proname = 'search_contacts' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;

-- 4. Create updated search_contacts RPC using the index
CREATE OR REPLACE FUNCTION public.search_contacts(
  p_brand_id uuid DEFAULT NULL,
  p_query text DEFAULT NULL,
  p_tag_ids uuid[] DEFAULT NULL,
  p_match_all_tags boolean DEFAULT FALSE,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_result json;
  v_tag_count int := COALESCE(array_length(p_tag_ids, 1), 0);
  v_clean_query text;
BEGIN
  -- Authentication
  SELECT u.id INTO v_user_id FROM public.users u WHERE u.supabase_auth_id = auth.uid();
  IF v_user_id IS NULL THEN 
    RAISE EXCEPTION 'Unauthorized'; 
  END IF;
  
  -- Brand access validation
  IF p_brand_id IS NOT NULL AND NOT user_belongs_to_brand(v_user_id, p_brand_id) THEN
    RAISE EXCEPTION 'Forbidden: no access to brand';
  END IF;
  
  -- Input validation
  IF p_query IS NOT NULL AND length(p_query) > 200 THEN
    RAISE EXCEPTION 'Query too long: max 200 characters';
  END IF;
  
  p_limit := LEAST(p_limit, 500);
  p_offset := GREATEST(p_offset, 0);
  v_clean_query := NULLIF(TRIM(p_query), '');

  WITH user_brands AS (
    SELECT ur.brand_id FROM user_roles ur WHERE ur.user_id = v_user_id
  ),
  filtered AS (
    SELECT 
      c.id, c.brand_id, c.first_name, c.last_name, c.email, c.city, c.status,
      c.created_at, c.updated_at,
      (
        SELECT json_agg(json_build_object(
          'id', cp.id,
          'phone_normalized', cp.phone_normalized,
          'is_primary', cp.is_primary
        ) ORDER BY cp.is_primary DESC, cp.created_at)
        FROM contact_phones cp 
        WHERE cp.contact_id = c.id AND cp.is_active
      ) AS phones
    FROM contacts c
    JOIN contact_search_index csi ON csi.contact_id = c.id
    WHERE 
      -- Brand filter: multi-brand or single brand
      (
        (p_brand_id IS NULL AND csi.brand_id IN (SELECT brand_id FROM user_brands))
        OR (p_brand_id IS NOT NULL AND c.brand_id = p_brand_id)
      )
      -- Full-text search using the index
      AND (
        v_clean_query IS NULL
        OR csi.search_text ILIKE '%' || v_clean_query || '%'
      )
      -- Tag filter
      AND (
        v_tag_count = 0 
        OR (
          p_match_all_tags = FALSE AND EXISTS (
            SELECT 1 FROM tag_assignments ta 
            WHERE ta.contact_id = c.id AND ta.tag_id = ANY(p_tag_ids)
          )
        )
        OR (
          p_match_all_tags = TRUE AND (
            SELECT COUNT(DISTINCT ta.tag_id) 
            FROM tag_assignments ta 
            WHERE ta.contact_id = c.id AND ta.tag_id = ANY(p_tag_ids)
          ) = v_tag_count
        )
      )
    ORDER BY c.updated_at DESC
    LIMIT p_limit OFFSET p_offset
  ),
  total_count AS (
    SELECT COUNT(*) as cnt
    FROM contacts c
    JOIN contact_search_index csi ON csi.contact_id = c.id
    WHERE 
      (
        (p_brand_id IS NULL AND csi.brand_id IN (SELECT brand_id FROM user_brands))
        OR (p_brand_id IS NOT NULL AND c.brand_id = p_brand_id)
      )
      AND (
        v_clean_query IS NULL
        OR csi.search_text ILIKE '%' || v_clean_query || '%'
      )
      AND (
        v_tag_count = 0 
        OR (
          p_match_all_tags = FALSE AND EXISTS (
            SELECT 1 FROM tag_assignments ta 
            WHERE ta.contact_id = c.id AND ta.tag_id = ANY(p_tag_ids)
          )
        )
        OR (
          p_match_all_tags = TRUE AND (
            SELECT COUNT(DISTINCT ta.tag_id) 
            FROM tag_assignments ta 
            WHERE ta.contact_id = c.id AND ta.tag_id = ANY(p_tag_ids)
          ) = v_tag_count
        )
      )
  )
  SELECT json_build_object(
    'contacts', COALESCE((SELECT json_agg(row_to_json(filtered)) FROM filtered), '[]'::json),
    'total', (SELECT cnt FROM total_count),
    'limit', p_limit,
    'offset', p_offset
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;

-- 5. Create rebuild function
CREATE OR REPLACE FUNCTION public.rebuild_contact_search_index()
RETURNS INTEGER 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public
AS $$
DECLARE 
  v_count INTEGER := 0;
BEGIN
  DELETE FROM contact_search_index;
  
  INSERT INTO contact_search_index (contact_id, brand_id, search_text, search_vector, updated_at)
  SELECT 
    c.id, 
    c.brand_id, 
    public.build_contact_search_text(c.id),
    to_tsvector('simple', public.build_contact_search_text(c.id)),
    now()
  FROM contacts c;
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END; 
$$;

-- 6. Rebuild the index for existing contacts
SELECT public.rebuild_contact_search_index();