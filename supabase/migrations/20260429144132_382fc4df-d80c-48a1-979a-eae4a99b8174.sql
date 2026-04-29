-- ============================================================
-- MCP Resource Subscriptions & Change Feed
-- ============================================================

-- 1) Subscriptions table (token <-> uri pattern)
CREATE TABLE IF NOT EXISTS public.mcp_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id uuid NOT NULL REFERENCES public.mcp_access_tokens(id) ON DELETE CASCADE,
  uri text NOT NULL,
  resource_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_notified_at timestamptz,
  UNIQUE (token_id, uri)
);

CREATE INDEX IF NOT EXISTS mcp_subscriptions_token_idx
  ON public.mcp_subscriptions (token_id);
CREATE INDEX IF NOT EXISTS mcp_subscriptions_uri_idx
  ON public.mcp_subscriptions (uri);

ALTER TABLE public.mcp_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_mcp_subs"
  ON public.mcp_subscriptions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "users_view_own_mcp_subs"
  ON public.mcp_subscriptions FOR SELECT
  USING (
    token_id IN (
      SELECT id FROM public.mcp_access_tokens
      WHERE user_id = public.get_user_id(auth.uid())
    )
  );

-- 2) Resource change feed (append-only, 7 day TTL)
CREATE TABLE IF NOT EXISTS public.mcp_resource_changes (
  id bigserial PRIMARY KEY,
  uri text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  brand_id uuid,
  change_type text NOT NULL CHECK (change_type IN ('created','updated','deleted')),
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mcp_resource_changes_uri_time_idx
  ON public.mcp_resource_changes (uri, occurred_at DESC);
CREATE INDEX IF NOT EXISTS mcp_resource_changes_time_idx
  ON public.mcp_resource_changes (occurred_at DESC);
CREATE INDEX IF NOT EXISTS mcp_resource_changes_type_idx
  ON public.mcp_resource_changes (resource_type, occurred_at DESC);

ALTER TABLE public.mcp_resource_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_mcp_changes"
  ON public.mcp_resource_changes FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 3) Generic change emitter for CRM tables
CREATE OR REPLACE FUNCTION public.mcp_emit_resource_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uri text;
  v_type text := TG_ARGV[0];
  v_id text;
  v_brand uuid;
  v_change text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_change := 'deleted';
    v_id := COALESCE(OLD.id::text, '');
    BEGIN v_brand := OLD.brand_id; EXCEPTION WHEN undefined_column THEN v_brand := NULL; END;
  ELSIF TG_OP = 'INSERT' THEN
    v_change := 'created';
    v_id := COALESCE(NEW.id::text, '');
    BEGIN v_brand := NEW.brand_id; EXCEPTION WHEN undefined_column THEN v_brand := NULL; END;
  ELSE
    v_change := 'updated';
    v_id := COALESCE(NEW.id::text, '');
    BEGIN v_brand := NEW.brand_id; EXCEPTION WHEN undefined_column THEN v_brand := NULL; END;
  END IF;

  v_uri := 'crm://' || v_type || '/' || v_id;

  INSERT INTO public.mcp_resource_changes
    (uri, resource_type, resource_id, brand_id, change_type)
  VALUES
    (v_uri, v_type, v_id, v_brand, v_change);

  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  -- never break business writes if change feed fails
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 4) Attach triggers to core CRM entities
DROP TRIGGER IF EXISTS mcp_resource_change_contacts ON public.contacts;
CREATE TRIGGER mcp_resource_change_contacts
  AFTER INSERT OR UPDATE OR DELETE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.mcp_emit_resource_change('contacts');

DROP TRIGGER IF EXISTS mcp_resource_change_appointments ON public.appointments;
CREATE TRIGGER mcp_resource_change_appointments
  AFTER INSERT OR UPDATE OR DELETE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.mcp_emit_resource_change('appointments');

DROP TRIGGER IF EXISTS mcp_resource_change_deals ON public.deals;
CREATE TRIGGER mcp_resource_change_deals
  AFTER INSERT OR UPDATE OR DELETE ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.mcp_emit_resource_change('deals');

-- 5) Subscription matching helpers
CREATE OR REPLACE FUNCTION public.mcp_subscribe_resource(
  p_token_id uuid,
  p_uri text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_type text;
BEGIN
  IF p_token_id IS NULL OR p_uri IS NULL OR length(p_uri) = 0 THEN
    RAISE EXCEPTION 'invalid_args';
  END IF;

  -- Extract resource type from uri prefix crm://<type>/...
  v_type := split_part(replace(p_uri, 'crm://', ''), '/', 1);

  INSERT INTO public.mcp_subscriptions (token_id, uri, resource_type)
  VALUES (p_token_id, p_uri, v_type)
  ON CONFLICT (token_id, uri) DO UPDATE
    SET resource_type = EXCLUDED.resource_type
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.mcp_unsubscribe_resource(
  p_token_id uuid,
  p_uri text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  DELETE FROM public.mcp_subscriptions
   WHERE token_id = p_token_id AND uri = p_uri;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$$;

-- 6) Poll changes for a token
CREATE OR REPLACE FUNCTION public.mcp_poll_changes(
  p_token_id uuid,
  p_since timestamptz DEFAULT NULL,
  p_limit int DEFAULT 100
) RETURNS TABLE (
  uri text,
  resource_type text,
  change_type text,
  occurred_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since timestamptz;
BEGIN
  v_since := COALESCE(p_since, now() - interval '5 minutes');

  RETURN QUERY
  SELECT DISTINCT ON (c.uri)
    c.uri, c.resource_type, c.change_type, c.occurred_at
  FROM public.mcp_resource_changes c
  WHERE c.occurred_at > v_since
    AND (
      -- exact uri match
      EXISTS (
        SELECT 1 FROM public.mcp_subscriptions s
        WHERE s.token_id = p_token_id AND s.uri = c.uri
      )
      OR
      -- collection-level subscription crm://<type> or crm://<type>/*
      EXISTS (
        SELECT 1 FROM public.mcp_subscriptions s
        WHERE s.token_id = p_token_id
          AND (
            s.uri = 'crm://' || c.resource_type
            OR s.uri = 'crm://' || c.resource_type || '/*'
            OR s.uri = 'crm://*'
          )
      )
    )
  ORDER BY c.uri, c.occurred_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 500);

  -- Touch last_notified_at
  UPDATE public.mcp_subscriptions
     SET last_notified_at = now()
   WHERE token_id = p_token_id
     AND last_notified_at IS DISTINCT FROM now();
END;
$$;

-- 7) TTL cleanup (manual call; cron can be added later)
CREATE OR REPLACE FUNCTION public.mcp_cleanup_resource_changes()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  DELETE FROM public.mcp_resource_changes
   WHERE occurred_at < now() - interval '7 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;