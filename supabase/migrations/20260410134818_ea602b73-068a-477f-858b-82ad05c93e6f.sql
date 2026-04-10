
-- 1. Create the canonical audit_events table
CREATE TABLE public.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  actor_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  actor_type text NOT NULL DEFAULT 'user',
  actor_display_name text,
  source text NOT NULL DEFAULT 'trigger',
  old_value jsonb,
  new_value jsonb,
  changed_fields text[],
  metadata jsonb NOT NULL DEFAULT '{}',
  correlation_id text,
  idempotency_key text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Indexes
CREATE INDEX idx_audit_events_brand_occurred ON public.audit_events (brand_id, occurred_at DESC);
CREATE INDEX idx_audit_events_entity ON public.audit_events (entity_type, entity_id, occurred_at DESC);
CREATE INDEX idx_audit_events_actor ON public.audit_events (actor_user_id, occurred_at DESC);
CREATE INDEX idx_audit_events_action ON public.audit_events (action, occurred_at DESC);
CREATE INDEX idx_audit_events_metadata ON public.audit_events USING GIN (metadata);
CREATE UNIQUE INDEX idx_audit_events_idempotency ON public.audit_events (idempotency_key) WHERE idempotency_key IS NOT NULL;

-- 3. RLS — append-only
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

-- SELECT: users belonging to the brand (correct 2-arg signature)
CREATE POLICY "audit_events_select_brand_members"
  ON public.audit_events FOR SELECT TO authenticated
  USING (public.user_belongs_to_brand(public.get_user_id(auth.uid()), brand_id));

-- 4. Context setter
CREATE OR REPLACE FUNCTION public.set_audit_context(
  p_actor_user_id uuid DEFAULT NULL,
  p_actor_type text DEFAULT 'user',
  p_actor_display_name text DEFAULT NULL,
  p_source text DEFAULT 'ui',
  p_correlation_id text DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.audit_actor_user_id', COALESCE(p_actor_user_id::text, ''), true);
  PERFORM set_config('app.audit_actor_type', COALESCE(p_actor_type, 'user'), true);
  PERFORM set_config('app.audit_actor_display_name', COALESCE(p_actor_display_name, ''), true);
  PERFORM set_config('app.audit_source', COALESCE(p_source, 'ui'), true);
  PERFORM set_config('app.audit_correlation_id', COALESCE(p_correlation_id, ''), true);
  PERFORM set_config('app.audit_reason', COALESCE(p_reason, ''), true);
END;
$$;

-- 5. Core write function
CREATE OR REPLACE FUNCTION public.write_audit_event(
  p_brand_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_action text,
  p_old_value jsonb DEFAULT NULL,
  p_new_value jsonb DEFAULT NULL,
  p_changed_fields text[] DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}',
  p_idempotency_key text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_user_id uuid;
  v_actor_type text;
  v_actor_display_name text;
  v_source text;
  v_correlation_id text;
  v_reason text;
  v_event_id uuid;
  v_final_metadata jsonb;
BEGIN
  BEGIN
    v_actor_user_id := NULLIF(current_setting('app.audit_actor_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_actor_user_id := NULL;
  END;

  v_actor_type := COALESCE(NULLIF(current_setting('app.audit_actor_type', true), ''), 'system');
  v_actor_display_name := NULLIF(current_setting('app.audit_actor_display_name', true), '');
  v_source := COALESCE(NULLIF(current_setting('app.audit_source', true), ''), 'trigger');
  v_correlation_id := NULLIF(current_setting('app.audit_correlation_id', true), '');
  v_reason := NULLIF(current_setting('app.audit_reason', true), '');

  IF v_actor_user_id IS NULL THEN
    BEGIN
      SELECT id, COALESCE(first_name || ' ' || last_name, email)
        INTO v_actor_user_id, v_actor_display_name
        FROM public.users
       WHERE supabase_auth_id = auth.uid()
       LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  IF v_actor_display_name IS NULL AND v_actor_user_id IS NOT NULL THEN
    SELECT COALESCE(first_name || ' ' || last_name, email)
      INTO v_actor_display_name
      FROM public.users
     WHERE id = v_actor_user_id
     LIMIT 1;
  END IF;

  v_final_metadata := COALESCE(p_metadata, '{}'::jsonb);
  IF v_reason IS NOT NULL THEN
    v_final_metadata := v_final_metadata || jsonb_build_object('reason', v_reason);
  END IF;

  INSERT INTO public.audit_events (
    brand_id, entity_type, entity_id, action,
    actor_user_id, actor_type, actor_display_name, source,
    old_value, new_value, changed_fields,
    metadata, correlation_id, idempotency_key
  ) VALUES (
    p_brand_id, p_entity_type, p_entity_id, p_action,
    v_actor_user_id, v_actor_type, v_actor_display_name, v_source,
    p_old_value, p_new_value, p_changed_fields,
    v_final_metadata, v_correlation_id, p_idempotency_key
  )
  ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

-- 6. Generic trigger function
CREATE OR REPLACE FUNCTION public.audit_trigger_func()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
  v_entity_type text;
  v_entity_id uuid;
  v_brand_id uuid;
  v_old_value jsonb;
  v_new_value jsonb;
  v_changed text[];
BEGIN
  v_entity_type := TG_ARGV[0];
  IF v_entity_type IS NULL THEN
    v_entity_type := TG_TABLE_NAME;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_action := 'create';
    v_entity_id := NEW.id;
    v_brand_id := NEW.brand_id;
    v_new_value := to_jsonb(NEW);
    v_old_value := NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update';
    v_entity_id := NEW.id;
    v_brand_id := NEW.brand_id;
    v_old_value := to_jsonb(OLD);
    v_new_value := to_jsonb(NEW);
    v_changed := ARRAY(
      SELECT key FROM jsonb_each(to_jsonb(NEW))
      WHERE to_jsonb(NEW) ->> key IS DISTINCT FROM to_jsonb(OLD) ->> key
        AND key NOT IN ('updated_at', 'created_at')
    );
    IF array_length(v_changed, 1) IS NULL OR array_length(v_changed, 1) = 0 THEN
      RETURN NEW;
    END IF;
    IF 'status' = ANY(v_changed) THEN
      v_action := 'status_change';
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'delete';
    v_entity_id := OLD.id;
    v_brand_id := OLD.brand_id;
    v_old_value := to_jsonb(OLD);
    v_new_value := NULL;
  END IF;

  BEGIN
    PERFORM write_audit_event(
      p_brand_id := v_brand_id,
      p_entity_type := v_entity_type,
      p_entity_id := v_entity_id,
      p_action := v_action,
      p_old_value := v_old_value,
      p_new_value := v_new_value,
      p_changed_fields := v_changed
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'audit_trigger_func failed for % on %: %', v_action, v_entity_type, SQLERRM;
  END;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- 7. Attach triggers to core entities
CREATE TRIGGER audit_contacts
  AFTER INSERT OR UPDATE OR DELETE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func('contact');

CREATE TRIGGER audit_deals
  AFTER INSERT OR UPDATE OR DELETE ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func('deal');

CREATE TRIGGER audit_tickets
  AFTER INSERT OR UPDATE OR DELETE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func('ticket');

CREATE TRIGGER audit_appointments
  AFTER INSERT OR UPDATE OR DELETE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func('appointment');

CREATE TRIGGER audit_tag_assignments
  AFTER INSERT OR DELETE ON public.tag_assignments
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func('tag_assignment');
