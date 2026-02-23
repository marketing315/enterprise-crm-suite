-- Fix user_can_access_brand to resolve auth UUID → internal user ID
-- Same pattern as user_belongs_to_brand fix
CREATE OR REPLACE FUNCTION public.user_can_access_brand(p_user_id uuid, p_brand_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_internal_id uuid;
BEGIN
  -- Resolve auth UUID to internal user ID
  SELECT id INTO v_internal_id FROM public.users WHERE supabase_auth_id = p_user_id LIMIT 1;
  IF v_internal_id IS NULL THEN
    RETURN false;
  END IF;

  -- Direct access
  IF EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = v_internal_id AND ur.brand_id = p_brand_id
  ) THEN
    RETURN true;
  END IF;
  
  -- Check if user has parent brand with can_access_children
  RETURN EXISTS (
    SELECT 1 
    FROM user_roles ur
    JOIN brands b ON b.parent_brand_id = ur.brand_id
    WHERE ur.user_id = v_internal_id
      AND ur.can_access_children = true
      AND b.id = p_brand_id
  );
END;
$function$;