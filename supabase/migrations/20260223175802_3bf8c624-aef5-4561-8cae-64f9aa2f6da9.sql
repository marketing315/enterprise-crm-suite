-- Fix user_belongs_to_brand: RLS passes internal user ID (from get_user_id), 
-- but function was matching against supabase_auth_id → never matches
CREATE OR REPLACE FUNCTION public.user_belongs_to_brand(_user_id uuid, _brand_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.brand_id = _brand_id
  )
$$;