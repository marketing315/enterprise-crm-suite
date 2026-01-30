-- =============================================
-- RBAC - Step 2: Helper functions and RLS
-- =============================================

-- 1. Create role hierarchy level function
CREATE OR REPLACE FUNCTION get_role_level(p_role app_role)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_role
    WHEN 'admin' THEN 100
    WHEN 'ceo' THEN 90
    WHEN 'responsabile_venditori' THEN 50
    WHEN 'responsabile_callcenter' THEN 50
    WHEN 'venditore' THEN 10
    WHEN 'sales' THEN 10
    WHEN 'operatore_callcenter' THEN 10
    WHEN 'callcenter' THEN 10
    ELSE 0
  END;
$$;

-- 2. Create can_manage_role function
CREATE OR REPLACE FUNCTION can_manage_role(manager_role app_role, target_role app_role)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN manager_role = 'admin' THEN true
    WHEN manager_role = 'ceo' AND target_role != 'admin' THEN true
    WHEN manager_role = 'responsabile_venditori' 
      AND target_role IN ('venditore', 'sales') THEN true
    WHEN manager_role = 'responsabile_callcenter' 
      AND target_role IN ('operatore_callcenter', 'callcenter') THEN true
    ELSE false
  END;
$$;

-- 3. Create current_brand_role function
CREATE OR REPLACE FUNCTION current_brand_role(p_brand_id uuid)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM user_roles
  WHERE user_id = get_user_id(auth.uid())
    AND brand_id = p_brand_id
    AND is_active = true
  ORDER BY get_role_level(role) DESC
  LIMIT 1;
$$;

-- 4. Create function to check if user can manage in brand
CREATE OR REPLACE FUNCTION can_manage_role_in_brand(p_brand_id uuid, target_role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = get_user_id(auth.uid())
      AND brand_id = p_brand_id
      AND is_active = true
      AND can_manage_role(role, target_role)
  );
$$;

-- 5. Create function to get roles user can assign
CREATE OR REPLACE FUNCTION get_assignable_roles(p_brand_id uuid)
RETURNS TABLE(role_value app_role, role_label text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role app_role;
BEGIN
  SELECT ur.role INTO v_caller_role
  FROM user_roles ur
  WHERE ur.user_id = get_user_id(auth.uid())
    AND ur.brand_id = p_brand_id
    AND ur.is_active = true
  ORDER BY get_role_level(ur.role) DESC
  LIMIT 1;

  RETURN QUERY
  SELECT r.role_value, r.role_label
  FROM (VALUES 
    ('ceo'::app_role, 'CEO'),
    ('responsabile_venditori'::app_role, 'Responsabile Venditori'),
    ('responsabile_callcenter'::app_role, 'Responsabile Call Center'),
    ('venditore'::app_role, 'Venditore'),
    ('operatore_callcenter'::app_role, 'Operatore Call Center')
  ) AS r(role_value, role_label)
  WHERE can_manage_role(v_caller_role, r.role_value);
END;
$$;

-- 6. Create function to list team members
CREATE OR REPLACE FUNCTION list_team_members(
  p_brand_id uuid,
  p_role_filter app_role DEFAULT NULL,
  p_active_only boolean DEFAULT true
)
RETURNS TABLE(
  membership_id uuid,
  user_id uuid,
  email text,
  full_name text,
  role app_role,
  is_active boolean,
  created_at timestamptz,
  can_edit boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role app_role;
BEGIN
  SELECT ur.role INTO v_caller_role
  FROM user_roles ur
  WHERE ur.user_id = get_user_id(auth.uid())
    AND ur.brand_id = p_brand_id
    AND ur.is_active = true
  ORDER BY get_role_level(ur.role) DESC
  LIMIT 1;

  IF v_caller_role IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT 
    ur.id AS membership_id,
    ur.user_id,
    u.email,
    u.full_name,
    ur.role,
    ur.is_active,
    ur.created_at,
    can_manage_role(v_caller_role, ur.role) AS can_edit
  FROM user_roles ur
  JOIN users u ON u.id = ur.user_id
  WHERE ur.brand_id = p_brand_id
    AND (p_role_filter IS NULL OR ur.role = p_role_filter)
    AND (NOT p_active_only OR ur.is_active = true)
    AND (
      v_caller_role IN ('admin', 'ceo')
      OR can_manage_role(v_caller_role, ur.role)
      OR ur.user_id = get_user_id(auth.uid())
    )
  ORDER BY get_role_level(ur.role) DESC, u.full_name;
END;
$$;

-- 7. Create function to update team member
CREATE OR REPLACE FUNCTION update_team_member(
  p_membership_id uuid,
  p_new_role app_role DEFAULT NULL,
  p_is_active boolean DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand_id uuid;
  v_current_role app_role;
  v_caller_role app_role;
BEGIN
  -- Get current membership info
  SELECT brand_id, role INTO v_brand_id, v_current_role
  FROM user_roles WHERE id = p_membership_id;

  IF v_brand_id IS NULL THEN
    RAISE EXCEPTION 'Membership not found';
  END IF;

  -- Get caller's role
  SELECT ur.role INTO v_caller_role
  FROM user_roles ur
  WHERE ur.user_id = get_user_id(auth.uid())
    AND ur.brand_id = v_brand_id
    AND ur.is_active = true
  ORDER BY get_role_level(ur.role) DESC
  LIMIT 1;

  -- Check caller can manage current role
  IF NOT can_manage_role(v_caller_role, v_current_role) THEN
    RAISE EXCEPTION 'Non autorizzato a gestire questo membro';
  END IF;

  -- If changing role, check can manage new role too
  IF p_new_role IS NOT NULL AND NOT can_manage_role(v_caller_role, p_new_role) THEN
    RAISE EXCEPTION 'Non autorizzato ad assegnare questo ruolo';
  END IF;

  -- Prevent self-demotion for protection
  IF (SELECT user_id FROM user_roles WHERE id = p_membership_id) = get_user_id(auth.uid()) 
     AND p_new_role IS NOT NULL 
     AND get_role_level(p_new_role) < get_role_level(v_current_role) THEN
    RAISE EXCEPTION 'Non puoi demotare te stesso';
  END IF;

  -- Update
  UPDATE user_roles SET
    role = COALESCE(p_new_role, role),
    is_active = COALESCE(p_is_active, is_active)
  WHERE id = p_membership_id;
END;
$$;

-- 8. Update RLS policies
DROP POLICY IF EXISTS "Users can view their own roles" ON user_roles;
DROP POLICY IF EXISTS "Admins can manage user roles" ON user_roles;
DROP POLICY IF EXISTS "Users can view roles in their brands" ON user_roles;
DROP POLICY IF EXISTS "Users can insert roles they can manage" ON user_roles;
DROP POLICY IF EXISTS "Users can update roles they can manage" ON user_roles;

CREATE POLICY "Users can view roles in their brands"
ON user_roles FOR SELECT
USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

-- INSERT/UPDATE handled via RPC functions for proper validation

-- 9. Create index for performance
CREATE INDEX IF NOT EXISTS idx_user_roles_brand_active 
ON user_roles(brand_id, is_active) 
WHERE is_active = true;