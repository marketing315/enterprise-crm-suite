-- ============================================================
-- SECURITY FIX: Split outbound_webhooks RLS policy to prevent
-- direct SELECT of secret column by admins
-- ============================================================

-- Drop the existing ALL policy that allows reading secrets
DROP POLICY IF EXISTS "Admins can manage webhooks in their brands" ON public.outbound_webhooks;
DROP POLICY IF EXISTS "Users can view webhooks in their brands" ON public.outbound_webhooks;

-- Create a secure view that excludes the secret column
CREATE OR REPLACE VIEW public.outbound_webhooks_safe AS
SELECT 
  id,
  brand_id,
  name,
  url,
  is_active,
  event_types,
  created_at,
  updated_at
FROM public.outbound_webhooks;

-- Grant access to authenticated users on the view
GRANT SELECT ON public.outbound_webhooks_safe TO authenticated;

-- Create separate policies for each operation
-- SELECT: Deny direct access - force use of RPC or safe view
CREATE POLICY "Deny direct SELECT on webhooks"
ON public.outbound_webhooks
FOR SELECT
USING (false);

-- INSERT: Admins can create webhooks
CREATE POLICY "Admins can insert webhooks"
ON public.outbound_webhooks
FOR INSERT
WITH CHECK (has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role));

-- UPDATE: Admins can update webhooks
CREATE POLICY "Admins can update webhooks"
ON public.outbound_webhooks
FOR UPDATE
USING (has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role));

-- DELETE: Admins can delete webhooks
CREATE POLICY "Admins can delete webhooks"
ON public.outbound_webhooks
FOR DELETE
USING (has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role));

-- ============================================================
-- INPUT VALIDATION: Drop all overloads of search_contacts first
-- ============================================================
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'search_contacts'
  LOOP
    EXECUTE format(
      'DROP FUNCTION IF EXISTS public.search_contacts(%s);',
      pg_get_function_identity_arguments(r.oid)
    );
  END LOOP;
END $$;

-- Recreate search_contacts with input validation
CREATE OR REPLACE FUNCTION public.search_contacts(
  p_brand_id uuid,
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
  -- Resolve user
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

  -- INPUT VALIDATION: Limit query length to prevent DoS
  IF p_query IS NOT NULL AND length(p_query) > 200 THEN
    RAISE EXCEPTION 'Query too long: max 200 characters';
  END IF;

  -- Limit pagination parameters
  IF p_limit > 500 THEN
    p_limit := 500;
  END IF;
  IF p_offset < 0 THEN
    p_offset := 0;
  END IF;

  -- Clean and prepare query
  v_clean_query := NULLIF(TRIM(p_query), '');

  WITH filtered AS (
    SELECT 
      c.id,
      c.first_name,
      c.last_name,
      c.email,
      c.city,
      c.status,
      c.created_at,
      c.updated_at,
      (
        SELECT json_agg(json_build_object(
          'id', cp.id,
          'phone_normalized', cp.phone_normalized,
          'is_primary', cp.is_primary
        ) ORDER BY cp.is_primary DESC, cp.created_at)
        FROM contact_phones cp
        WHERE cp.contact_id = c.id AND cp.is_active = true
      ) AS phones
    FROM contacts c
    WHERE c.brand_id = p_brand_id
      AND (
        v_clean_query IS NULL
        OR c.first_name ILIKE '%' || v_clean_query || '%'
        OR c.last_name ILIKE '%' || v_clean_query || '%'
        OR c.email ILIKE '%' || v_clean_query || '%'
        OR c.city ILIKE '%' || v_clean_query || '%'
        OR EXISTS (
          SELECT 1 FROM contact_phones cp
          WHERE cp.contact_id = c.id
            AND cp.phone_normalized LIKE '%' || regexp_replace(v_clean_query, '[^0-9]', '', 'g') || '%'
        )
      )
      AND (
        v_tag_count = 0
        OR (
          p_match_all_tags = FALSE
          AND EXISTS (
            SELECT 1 FROM tag_assignments ta
            WHERE ta.contact_id = c.id
              AND ta.tag_id = ANY(p_tag_ids)
          )
        )
        OR (
          p_match_all_tags = TRUE
          AND (
            SELECT COUNT(DISTINCT ta.tag_id)
            FROM tag_assignments ta
            WHERE ta.contact_id = c.id
              AND ta.tag_id = ANY(p_tag_ids)
          ) = v_tag_count
        )
      )
  ),
  counted AS (
    SELECT COUNT(*) AS total FROM filtered
  ),
  paginated AS (
    SELECT f.*
    FROM filtered f
    ORDER BY f.updated_at DESC
    LIMIT p_limit
    OFFSET p_offset
  )
  SELECT json_build_object(
    'contacts', COALESCE((SELECT json_agg(row_to_json(p)) FROM paginated p), '[]'::json),
    'total', (SELECT total FROM counted),
    'limit', p_limit,
    'offset', p_offset
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_contacts TO authenticated;
COMMENT ON FUNCTION public.search_contacts IS 'Search contacts with input validation. Query max 200 chars, limit max 500.';