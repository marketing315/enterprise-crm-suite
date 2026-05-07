CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
      AND COALESCE(is_active, true) = true
  )
$$;

CREATE OR REPLACE FUNCTION public.has_role_for_brand(_user_id uuid, _brand_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND brand_id = _brand_id
      AND role = _role
      AND COALESCE(is_active, true) = true
  )
$$;

CREATE OR REPLACE FUNCTION public.user_belongs_to_brand(_user_id uuid, _brand_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'admin'::public.app_role)
    OR public.has_role(_user_id, 'ceo'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = _user_id
        AND ur.brand_id = _brand_id
        AND COALESCE(ur.is_active, true) = true
    )
$$;

CREATE OR REPLACE FUNCTION public.get_user_brand_ids(_user_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.has_role(_user_id, 'admin'::public.app_role) OR public.has_role(_user_id, 'ceo'::public.app_role)
      THEN COALESCE((SELECT ARRAY_AGG(DISTINCT b.id) FROM public.brands b), ARRAY[]::uuid[])
    ELSE COALESCE((
      SELECT ARRAY_AGG(DISTINCT ur.brand_id)
      FROM public.user_roles ur
      WHERE ur.user_id = _user_id
        AND COALESCE(ur.is_active, true) = true
    ), ARRAY[]::uuid[])
  END
$$;

CREATE OR REPLACE FUNCTION public.user_can_access_brand(p_user_id uuid, p_brand_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_internal_id uuid;
BEGIN
  SELECT id INTO v_internal_id
  FROM public.users
  WHERE supabase_auth_id = p_user_id
  LIMIT 1;

  IF v_internal_id IS NULL THEN
    RETURN false;
  END IF;

  IF public.has_role(v_internal_id, 'admin'::public.app_role) OR public.has_role(v_internal_id, 'ceo'::public.app_role) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = v_internal_id
      AND ur.brand_id = p_brand_id
      AND COALESCE(ur.is_active, true) = true
  ) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.brands b ON b.parent_brand_id = ur.brand_id
    WHERE ur.user_id = v_internal_id
      AND COALESCE(ur.is_active, true) = true
      AND ur.can_access_children = true
      AND b.id = p_brand_id
  );
END;
$$;