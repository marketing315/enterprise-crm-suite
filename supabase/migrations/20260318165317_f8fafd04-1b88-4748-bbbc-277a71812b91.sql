
-- SEC-01: Fix has_marketing_write_access to enforce brand_id filtering
-- Prevents cross-brand privilege escalation
CREATE OR REPLACE FUNCTION public.has_marketing_write_access(p_user_id uuid, p_brand_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = p_user_id
      AND brand_id = p_brand_id
      AND is_active = true
      AND role::text IN ('admin', 'ceo')
  );
$$;
