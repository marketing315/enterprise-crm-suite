-- Drop and recreate get_brand_operators with supabase_auth_id
DROP FUNCTION IF EXISTS public.get_brand_operators(uuid);

CREATE FUNCTION public.get_brand_operators(p_brand_id uuid)
 RETURNS TABLE(user_id uuid, supabase_auth_id uuid, full_name text, email text, role text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 
    u.id as user_id,
    u.supabase_auth_id,
    u.full_name,
    u.email,
    ur.role::text
  FROM users u
  JOIN user_roles ur ON ur.user_id = u.id
  WHERE ur.brand_id = p_brand_id
    AND ur.role IN ('callcenter', 'sales', 'admin')
  ORDER BY u.full_name;
$function$;

GRANT EXECUTE ON FUNCTION public.get_brand_operators(uuid) TO authenticated;