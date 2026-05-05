
-- C9: Admin RPC schema hardening + granular audit on role mutations

-- 1) Extend user_roles_guard to cover UPDATE/DELETE (defense-in-depth)
--    and emit audit events for every role mutation.
CREATE OR REPLACE FUNCTION public.user_roles_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_auth uuid := auth.uid();
  v_caller_internal uuid;
  v_target_brand uuid;
  v_target_role app_role;
  v_target_user uuid;
  v_action text;
  v_is_global_admin boolean := false;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_target_brand := OLD.brand_id;
    v_target_role  := OLD.role;
    v_target_user  := OLD.user_id;
    v_action := 'role.revoked';
  ELSE
    v_target_brand := NEW.brand_id;
    v_target_role  := NEW.role;
    v_target_user  := NEW.user_id;
    v_action := CASE TG_OP WHEN 'INSERT' THEN 'role.granted' ELSE 'role.updated' END;
  END IF;

  -- service_role / postgres / migration → bypass auth checks but still audit
  IF v_caller_auth IS NOT NULL THEN
    v_caller_internal := public.get_user_id(v_caller_auth);

    IF v_caller_internal IS NOT NULL AND v_target_role IN ('admin'::app_role, 'ceo'::app_role) THEN
      -- Global admin (System Brand) bypass
      SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = v_caller_internal
          AND brand_id = '00000000-0000-0000-0000-000000000000'::uuid
          AND role = 'admin'::app_role
          AND is_active = true
      ) INTO v_is_global_admin;

      IF NOT v_is_global_admin THEN
        IF NOT EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = v_caller_internal
            AND brand_id = v_target_brand
            AND role = 'admin'::app_role
            AND is_active = true
        ) THEN
          RAISE EXCEPTION 'cross-brand admin grant denied (caller has no admin on brand %)', v_target_brand
            USING ERRCODE = '42501';
        END IF;
      END IF;
    END IF;
  END IF;

  -- Granular audit (best-effort, never block the mutation)
  BEGIN
    PERFORM public.log_audit_event(
      p_entity_type := 'user_role',
      p_action      := v_action,
      p_brand_id    := v_target_brand,
      p_entity_id   := COALESCE(NEW.id, OLD.id),
      p_old_value   := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END,
      p_new_value   := CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END,
      p_metadata    := jsonb_build_object(
        'op', TG_OP,
        'target_user_id', v_target_user,
        'target_role', v_target_role,
        'caller_auth_uid', v_caller_auth,
        'caller_is_global_admin', v_is_global_admin
      ),
      p_source      := 'user_roles_guard'
    );
  EXCEPTION WHEN OTHERS THEN
    -- audit must never block role mgmt
    NULL;
  END;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END$function$;

DROP TRIGGER IF EXISTS user_roles_guard_trigger ON public.user_roles;
CREATE TRIGGER user_roles_guard_trigger
BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.user_roles_guard();

-- 2) Unified admin RPCs for role mgmt with explicit audit via log_rpc_call
CREATE OR REPLACE FUNCTION public.grant_user_role(
  p_user_id uuid,
  p_brand_id uuid,
  p_role app_role,
  p_can_access_children boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
  v_caller uuid := public.get_user_id(auth.uid());
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT public.can_manage_role_in_brand(p_brand_id, p_role) THEN
    PERFORM public.log_rpc_call('grant_user_role',
      jsonb_build_object('user_id',p_user_id,'brand_id',p_brand_id,'role',p_role),
      NULL, 'denied', p_brand_id);
    RAISE EXCEPTION 'caller cannot manage role % on brand %', p_role, p_brand_id
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.user_roles(user_id, brand_id, role, can_access_children, is_active)
  VALUES (p_user_id, p_brand_id, p_role, p_can_access_children, true)
  ON CONFLICT (user_id, brand_id, role)
  DO UPDATE SET is_active = true, can_access_children = EXCLUDED.can_access_children
  RETURNING id INTO v_id;

  PERFORM public.log_rpc_call('grant_user_role',
    jsonb_build_object('user_id',p_user_id,'brand_id',p_brand_id,'role',p_role),
    jsonb_build_object('id',v_id), 'ok', p_brand_id);

  RETURN v_id;
END$$;

CREATE OR REPLACE FUNCTION public.revoke_user_role(
  p_user_id uuid,
  p_brand_id uuid,
  p_role app_role
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := public.get_user_id(auth.uid());
  v_found boolean := false;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT public.can_manage_role_in_brand(p_brand_id, p_role) THEN
    PERFORM public.log_rpc_call('revoke_user_role',
      jsonb_build_object('user_id',p_user_id,'brand_id',p_brand_id,'role',p_role),
      NULL, 'denied', p_brand_id);
    RAISE EXCEPTION 'caller cannot manage role % on brand %', p_role, p_brand_id
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.user_roles
     SET is_active = false
   WHERE user_id = p_user_id
     AND brand_id = p_brand_id
     AND role = p_role
     AND is_active = true;
  GET DIAGNOSTICS v_found = ROW_COUNT;

  PERFORM public.log_rpc_call('revoke_user_role',
    jsonb_build_object('user_id',p_user_id,'brand_id',p_brand_id,'role',p_role),
    jsonb_build_object('updated', v_found), 'ok', p_brand_id);

  RETURN v_found;
END$$;

REVOKE ALL ON FUNCTION public.grant_user_role(uuid,uuid,app_role,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_user_role(uuid,uuid,app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grant_user_role(uuid,uuid,app_role,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_user_role(uuid,uuid,app_role) TO authenticated;
