
-- Fix user_belongs_to_brand to resolve auth UUID to internal user ID
-- Keep original parameter name _user_id to allow CREATE OR REPLACE
CREATE OR REPLACE FUNCTION public.user_belongs_to_brand(_user_id uuid, _brand_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.users u ON u.id = ur.user_id
    WHERE u.supabase_auth_id = _user_id
      AND ur.brand_id = _brand_id
  )
$$;
