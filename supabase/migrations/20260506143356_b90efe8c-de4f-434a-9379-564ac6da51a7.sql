
-- C9: admin_create_user RPC with advisory lock + scope enforcement
-- Trigger user_roles_guard already exists as second layer.

CREATE OR REPLACE FUNCTION public.admin_create_user(
  p_caller_auth_id uuid,
  p_target_user_id uuid,
  p_email text,
  p_brand_ids uuid[],
  p_role app_role
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_internal uuid;
  v_is_global_admin boolean := false;
  v_brand uuid;
  v_inserted int := 0;
  v_skipped int := 0;
  v_lock_key bigint;
BEGIN
  IF p_caller_auth_id IS NULL OR p_target_user_id IS NULL OR p_role IS NULL
     OR p_brand_ids IS NULL OR array_length(p_brand_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'admin_create_user: missing required arguments'
      USING ERRCODE = '22023';
  END IF;

  v_caller_internal := public.get_user_id(p_caller_auth_id);
  IF v_caller_internal IS NULL THEN
    RAISE EXCEPTION 'admin_create_user: caller not found'
      USING ERRCODE = '42501';
  END IF;

  -- Serialize concurrent admin_create_user calls targeting the same email.
  -- Uses a transaction-scoped advisory lock so two admins racing on the
  -- same target cannot both pass the scope check before the UNIQUE kicks in.
  v_lock_key := hashtextextended('admin_create_user:' || lower(coalesce(p_email, p_target_user_id::text)), 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Verify caller is admin (global or per-brand)
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_caller_internal
      AND brand_id = '00000000-0000-0000-0000-000000000000'::uuid
      AND role = 'admin'::app_role
      AND is_active = true
  ) INTO v_is_global_admin;

  IF NOT v_is_global_admin THEN
    -- Every requested brand must be in caller's admin scope
    IF EXISTS (
      SELECT 1
      FROM unnest(p_brand_ids) AS req(brand_id)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = v_caller_internal
          AND ur.brand_id = req.brand_id
          AND ur.role = 'admin'::app_role
          AND ur.is_active = true
      )
    ) THEN
      RAISE EXCEPTION 'admin_create_user: caller lacks admin scope on one or more brands'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Atomic role grant. Trigger user_roles_guard re-validates per-row.
  FOREACH v_brand IN ARRAY p_brand_ids LOOP
    BEGIN
      INSERT INTO public.user_roles (user_id, brand_id, role)
      VALUES (p_target_user_id, v_brand, p_role);
      v_inserted := v_inserted + 1;
    EXCEPTION WHEN unique_violation THEN
      v_skipped := v_skipped + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'inserted', v_inserted,
    'skipped', v_skipped,
    'caller_global_admin', v_is_global_admin
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_user(uuid, uuid, text, uuid[], app_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_user(uuid, uuid, text, uuid[], app_role) TO service_role;

COMMENT ON FUNCTION public.admin_create_user(uuid, uuid, text, uuid[], app_role) IS
  'C9: SECURITY DEFINER role-assignment RPC. Uses pg_advisory_xact_lock to serialize concurrent admin grants on the same target. Enforces per-brand admin scope. user_roles_guard trigger acts as second layer.';
