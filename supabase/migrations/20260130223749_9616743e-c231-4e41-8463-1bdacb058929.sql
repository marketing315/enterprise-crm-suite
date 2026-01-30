-- Fix search_path for IMMUTABLE functions
CREATE OR REPLACE FUNCTION get_role_level(p_role app_role)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
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

CREATE OR REPLACE FUNCTION can_manage_role(manager_role app_role, target_role app_role)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
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