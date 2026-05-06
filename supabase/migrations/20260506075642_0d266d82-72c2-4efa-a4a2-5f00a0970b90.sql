CREATE OR REPLACE FUNCTION public.assert_brand_membership(
  p_user_id uuid,
  p_brand_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL OR p_brand_id IS NULL THEN
    RAISE EXCEPTION 'user_id and brand_id are required'
      USING ERRCODE = '22023';
  END IF;

  IF public.has_role(p_user_id, 'admin'::app_role)
     OR public.has_role(p_user_id, 'ceo'::app_role)
  THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = p_user_id
      AND brand_id = p_brand_id
      AND COALESCE(is_active, true)
  ) THEN
    RETURN true;
  END IF;

  RAISE EXCEPTION 'user % not in brand %', p_user_id, p_brand_id
    USING ERRCODE = '42501';
END$$;

REVOKE ALL ON FUNCTION public.assert_brand_membership(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_brand_membership(uuid, uuid) TO authenticated, service_role;