-- 1) Plain text column
ALTER TABLE public.audit_events
  ADD COLUMN IF NOT EXISTS search_text text;

-- 2) Trigger function
CREATE OR REPLACE FUNCTION public.audit_events_refresh_search_text()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.search_text := lower(
    coalesce(NEW.entity_type, '') || ' ' ||
    coalesce(NEW.action, '') || ' ' ||
    coalesce(NEW.actor_display_name, '') || ' ' ||
    coalesce(NEW.correlation_id, '') || ' ' ||
    coalesce(array_to_string(NEW.changed_fields, ' '), '') || ' ' ||
    coalesce(NEW.metadata::text, '')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_events_search_text ON public.audit_events;
CREATE TRIGGER trg_audit_events_search_text
BEFORE INSERT OR UPDATE OF entity_type, action, actor_display_name, correlation_id, changed_fields, metadata
ON public.audit_events
FOR EACH ROW
EXECUTE FUNCTION public.audit_events_refresh_search_text();

-- 3) Backfill
UPDATE public.audit_events
SET search_text = lower(
  coalesce(entity_type, '') || ' ' ||
  coalesce(action, '') || ' ' ||
  coalesce(actor_display_name, '') || ' ' ||
  coalesce(correlation_id, '') || ' ' ||
  coalesce(array_to_string(changed_fields, ' '), '') || ' ' ||
  coalesce(metadata::text, '')
)
WHERE search_text IS NULL;

-- 4) Trigram GIN index (extension lives in 'extensions' schema)
CREATE INDEX IF NOT EXISTS idx_audit_events_search_trgm
  ON public.audit_events
  USING gin (search_text extensions.gin_trgm_ops);

-- 5) Safe search RPC
CREATE OR REPLACE FUNCTION public.search_audit_events(
  p_brand_id uuid,
  p_search text,
  p_entity_type text DEFAULT NULL,
  p_action text DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL,
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  brand_id uuid,
  entity_type text,
  entity_id uuid,
  action text,
  actor_user_id uuid,
  actor_type text,
  actor_display_name text,
  source text,
  old_value jsonb,
  new_value jsonb,
  changed_fields text[],
  metadata jsonb,
  correlation_id text,
  occurred_at timestamptz,
  created_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_search text;
  v_safe_limit int;
BEGIN
  IF NOT (public.user_belongs_to_brand(public.get_user_id(auth.uid()), p_brand_id)
          AND public.can_view_audit(auth.uid())) THEN
    RAISE EXCEPTION 'Not authorized to view audit events for this brand'
      USING ERRCODE = '42501';
  END IF;

  v_search := lower(trim(coalesce(p_search, '')));
  v_search := substring(v_search FROM 1 FOR 200);
  v_search := replace(replace(v_search, '%', ''), '_', '');

  v_safe_limit := least(greatest(coalesce(p_limit, 50), 1), 500);

  RETURN QUERY
  WITH filtered AS (
    SELECT ae.*
    FROM public.audit_events ae
    WHERE ae.brand_id = p_brand_id
      AND (v_search = '' OR ae.search_text ILIKE '%' || v_search || '%')
      AND (p_entity_type IS NULL OR ae.entity_type = p_entity_type)
      AND (p_action IS NULL OR ae.action = p_action)
      AND (p_actor_user_id IS NULL OR ae.actor_user_id = p_actor_user_id)
      AND (p_date_from IS NULL OR ae.occurred_at >= p_date_from)
      AND (p_date_to IS NULL OR ae.occurred_at <= p_date_to)
  ),
  counted AS (
    SELECT COUNT(*)::bigint AS total FROM filtered
  )
  SELECT
    f.id, f.brand_id, f.entity_type, f.entity_id, f.action,
    f.actor_user_id, f.actor_type, f.actor_display_name, f.source,
    f.old_value, f.new_value, f.changed_fields, f.metadata,
    f.correlation_id, f.occurred_at, f.created_at,
    c.total AS total_count
  FROM filtered f
  CROSS JOIN counted c
  ORDER BY f.occurred_at DESC
  LIMIT v_safe_limit
  OFFSET greatest(coalesce(p_offset, 0), 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_audit_events(uuid, text, text, text, uuid, timestamptz, timestamptz, int, int) TO authenticated;