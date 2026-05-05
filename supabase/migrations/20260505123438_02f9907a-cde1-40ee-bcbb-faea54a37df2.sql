-- =========================================================================
-- A4 — Centralized Audit Log + PII masking
-- =========================================================================

-- ---------- 1. PII masking helper ----------------------------------------
CREATE OR REPLACE FUNCTION public.mask_pii_jsonb(
  payload jsonb,
  actor_roles text[] DEFAULT ARRAY[]::text[]
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb := payload;
  pol record;
  k text;
  v text;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) <> 'object' THEN
    RETURN payload;
  END IF;

  FOR pol IN
    SELECT field_pattern, strategy, COALESCE(exempt_roles, ARRAY[]::text[]) AS exempt_roles
    FROM public.audit_pii_policies
    WHERE is_active = true
  LOOP
    -- skip if actor has an exempt role
    IF actor_roles && pol.exempt_roles THEN
      CONTINUE;
    END IF;

    FOR k IN SELECT jsonb_object_keys(result)
    LOOP
      IF lower(k) LIKE '%' || lower(pol.field_pattern) || '%' THEN
        v := result ->> k;
        IF v IS NULL OR v = '' THEN
          CONTINUE;
        END IF;
        IF pol.strategy = 'full' THEN
          result := jsonb_set(result, ARRAY[k], to_jsonb('***REDACTED***'::text));
        ELSE  -- partial
          result := jsonb_set(
            result,
            ARRAY[k],
            to_jsonb(
              CASE
                WHEN length(v) <= 2 THEN '***'
                WHEN length(v) <= 6 THEN left(v,1) || repeat('*', length(v)-2) || right(v,1)
                ELSE left(v,2) || repeat('*', length(v)-4) || right(v,2)
              END
            )
          );
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mask_pii_jsonb(jsonb, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mask_pii_jsonb(jsonb, text[]) TO service_role;

-- ---------- 2. Centralized audit writer ----------------------------------
CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_entity_type text,
  p_action text,
  p_brand_id uuid DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL,
  p_old_value jsonb DEFAULT NULL,
  p_new_value jsonb DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_source text DEFAULT 'app',
  p_correlation_id text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
  v_actor_uid uuid;
  v_actor_roles text[];
  v_changed_fields text[];
  v_old_masked jsonb;
  v_new_masked jsonb;
BEGIN
  v_actor_uid := public.get_user_id(auth.uid());

  IF v_actor_uid IS NOT NULL THEN
    SELECT array_agg(distinct role::text)
      INTO v_actor_roles
      FROM public.user_roles
     WHERE user_id = v_actor_uid;
  END IF;
  v_actor_roles := COALESCE(v_actor_roles, ARRAY[]::text[]);

  v_old_masked := public.mask_pii_jsonb(p_old_value, v_actor_roles);
  v_new_masked := public.mask_pii_jsonb(p_new_value, v_actor_roles);

  IF p_old_value IS NOT NULL AND p_new_value IS NOT NULL THEN
    SELECT array_agg(key)
      INTO v_changed_fields
      FROM (
        SELECT key
        FROM jsonb_each(p_new_value) n
        WHERE p_old_value->key IS DISTINCT FROM n.value
      ) t;
  END IF;

  INSERT INTO public.audit_events (
    brand_id, entity_type, entity_id, action,
    actor_user_id, actor_type,
    source, old_value, new_value, changed_fields,
    metadata, correlation_id, idempotency_key
  ) VALUES (
    p_brand_id, p_entity_type, p_entity_id, p_action,
    v_actor_uid,
    CASE WHEN v_actor_uid IS NULL THEN 'system' ELSE 'user' END,
    p_source, v_old_masked, v_new_masked, v_changed_fields,
    COALESCE(p_metadata,'{}'::jsonb), p_correlation_id, p_idempotency_key
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_audit_event(text,text,uuid,uuid,jsonb,jsonb,jsonb,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_audit_event(text,text,uuid,uuid,jsonb,jsonb,jsonb,text,text,text) TO authenticated, service_role;

-- ---------- 3. RPC-call audit wrapper ------------------------------------
CREATE OR REPLACE FUNCTION public.log_rpc_call(
  p_rpc_name text,
  p_args jsonb DEFAULT '{}'::jsonb,
  p_result jsonb DEFAULT NULL,
  p_status text DEFAULT 'ok',
  p_brand_id uuid DEFAULT NULL,
  p_correlation_id text DEFAULT NULL
)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.log_audit_event(
    'rpc',
    p_rpc_name,
    p_brand_id,
    NULL,
    NULL,
    jsonb_build_object('args', p_args, 'result', p_result),
    jsonb_build_object('status', p_status),
    'rpc',
    p_correlation_id,
    NULL
  );
$$;

REVOKE EXECUTE ON FUNCTION public.log_rpc_call(text,jsonb,jsonb,text,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_rpc_call(text,jsonb,jsonb,text,uuid,text) TO authenticated, service_role;

-- ---------- 4. State-change triggers -------------------------------------
CREATE OR REPLACE FUNCTION public.trg_audit_state_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changed boolean := false;
  v_old jsonb := '{}'::jsonb;
  v_new jsonb := '{}'::jsonb;
BEGIN
  IF TG_TABLE_NAME = 'tickets' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      v_changed := true;
      v_old := jsonb_build_object('status', OLD.status);
      v_new := jsonb_build_object('status', NEW.status);
    END IF;
  ELSIF TG_TABLE_NAME = 'deals' THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.current_stage_id IS DISTINCT FROM OLD.current_stage_id THEN
      v_changed := true;
      v_old := jsonb_build_object('status', OLD.status, 'current_stage_id', OLD.current_stage_id);
      v_new := jsonb_build_object('status', NEW.status, 'current_stage_id', NEW.current_stage_id);
    END IF;
  ELSIF TG_TABLE_NAME = 'contacts' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      v_changed := true;
      v_old := jsonb_build_object('status', OLD.status);
      v_new := jsonb_build_object('status', NEW.status);
    END IF;
  END IF;

  IF v_changed THEN
    PERFORM public.log_audit_event(
      TG_TABLE_NAME,
      'state_change',
      NEW.brand_id,
      NEW.id,
      v_old,
      v_new,
      jsonb_build_object('trigger', TG_NAME),
      'trigger'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_state_change ON public.tickets;
CREATE TRIGGER audit_state_change
  AFTER UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_state_change();

DROP TRIGGER IF EXISTS audit_state_change ON public.deals;
CREATE TRIGGER audit_state_change
  AFTER UPDATE ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_state_change();

DROP TRIGGER IF EXISTS audit_state_change ON public.contacts;
CREATE TRIGGER audit_state_change
  AFTER UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_state_change();

-- ---------- 5. Helpful indexes ------------------------------------------
CREATE INDEX IF NOT EXISTS idx_audit_events_entity
  ON public.audit_events (entity_type, entity_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_brand_action
  ON public.audit_events (brand_id, action, occurred_at DESC);

COMMENT ON FUNCTION public.log_audit_event IS
  'A4 centralized audit writer. Use this instead of inserting into audit_log/audit_events directly. Applies PII masking via audit_pii_policies.';
COMMENT ON FUNCTION public.log_rpc_call IS
  'A4 RPC-call audit wrapper. Records rpc_name, args, result, status with PII masking.';