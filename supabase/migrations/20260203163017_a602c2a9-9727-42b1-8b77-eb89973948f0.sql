-- Cleanup precedente tentativo (se esistente)
DROP TYPE IF EXISTS public.app_page CASCADE;

-- Enum per le pagine/sezioni del CRM
CREATE TYPE public.app_page AS ENUM (
  'dashboard',
  'contacts',
  'pipeline',
  'appointments',
  'tickets',
  'sales',
  'events',
  'chat',
  'notifications',
  'marketing_dashboard',
  'marketing_campaigns',
  'marketing_costs',
  'marketing_reports',
  'company_overview',
  'company_expenses',
  'company_budget',
  'company_reports',
  'team',
  'products',
  'salesperson_kpi',
  'ceo_dashboard',
  'admin_analytics',
  'admin_ai',
  'admin_ai_metrics',
  'admin_callcenter_kpi',
  'admin_ticket_trend',
  'admin_webhooks',
  'admin_dlq',
  'settings'
);

-- Permessi di default per ogni ruolo (quali pagine può vedere)
CREATE TABLE public.role_page_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  role text NOT NULL,
  page app_page NOT NULL,
  can_access boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, role, page)
);

-- Override permessi per singolo utente (sovrascrive permessi ruolo)
CREATE TABLE public.user_page_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  page app_page NOT NULL,
  can_access boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, brand_id, page)
);

-- Colonne nascoste per ruolo
CREATE TABLE public.role_hidden_columns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  role text NOT NULL,
  table_name text NOT NULL,
  column_key text NOT NULL,
  is_hidden boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, role, table_name, column_key)
);

-- Override colonne nascoste per singolo utente
CREATE TABLE public.user_hidden_columns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  table_name text NOT NULL,
  column_key text NOT NULL,
  is_hidden boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, brand_id, table_name, column_key)
);

-- Enable RLS
ALTER TABLE public.role_page_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_page_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_hidden_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_hidden_columns ENABLE ROW LEVEL SECURITY;

-- Admin/CEO can manage all permissions (con cast esplicito a app_role)
CREATE POLICY "Admin/CEO can manage role_page_permissions"
ON public.role_page_permissions
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN users u ON u.id = ur.user_id
    WHERE u.supabase_auth_id = auth.uid()
    AND ur.brand_id = role_page_permissions.brand_id
    AND ur.role IN ('admin'::app_role, 'ceo'::app_role)
  )
);

CREATE POLICY "Admin/CEO can manage user_page_permissions"
ON public.user_page_permissions
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN users u ON u.id = ur.user_id
    WHERE u.supabase_auth_id = auth.uid()
    AND ur.brand_id = user_page_permissions.brand_id
    AND ur.role IN ('admin'::app_role, 'ceo'::app_role)
  )
);

CREATE POLICY "Admin/CEO can manage role_hidden_columns"
ON public.role_hidden_columns
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN users u ON u.id = ur.user_id
    WHERE u.supabase_auth_id = auth.uid()
    AND ur.brand_id = role_hidden_columns.brand_id
    AND ur.role IN ('admin'::app_role, 'ceo'::app_role)
  )
);

CREATE POLICY "Admin/CEO can manage user_hidden_columns"
ON public.user_hidden_columns
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN users u ON u.id = ur.user_id
    WHERE u.supabase_auth_id = auth.uid()
    AND ur.brand_id = user_hidden_columns.brand_id
    AND ur.role IN ('admin'::app_role, 'ceo'::app_role)
  )
);

-- Users can read their own permissions
CREATE POLICY "Users can read own page permissions"
ON public.user_page_permissions
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = user_page_permissions.user_id
    AND u.supabase_auth_id = auth.uid()
  )
);

CREATE POLICY "Users can read own hidden columns"
ON public.user_hidden_columns
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = user_hidden_columns.user_id
    AND u.supabase_auth_id = auth.uid()
  )
);

-- Users can read role permissions for their roles
CREATE POLICY "Users can read role page permissions"
ON public.role_page_permissions
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN users u ON u.id = ur.user_id
    WHERE u.supabase_auth_id = auth.uid()
    AND ur.brand_id = role_page_permissions.brand_id
    AND ur.role::text = role_page_permissions.role
  )
);

CREATE POLICY "Users can read role hidden columns"
ON public.role_hidden_columns
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN users u ON u.id = ur.user_id
    WHERE u.supabase_auth_id = auth.uid()
    AND ur.brand_id = role_hidden_columns.brand_id
    AND ur.role::text = role_hidden_columns.role
  )
);

-- Function to check if user can access a page (with role fallback)
CREATE OR REPLACE FUNCTION public.user_can_access_page(
  p_user_id uuid,
  p_brand_id uuid,
  p_page app_page
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_override boolean;
  v_role_permission boolean;
  v_user_role app_role;
BEGIN
  -- Check for user-specific override first
  SELECT can_access INTO v_user_override
  FROM user_page_permissions
  WHERE user_id = p_user_id
  AND brand_id = p_brand_id
  AND page = p_page;
  
  IF v_user_override IS NOT NULL THEN
    RETURN v_user_override;
  END IF;
  
  -- Get user's role for this brand
  SELECT role INTO v_user_role
  FROM user_roles
  WHERE user_id = p_user_id
  AND brand_id = p_brand_id
  LIMIT 1;
  
  -- Admin and CEO always have access to everything
  IF v_user_role IN ('admin'::app_role, 'ceo'::app_role) THEN
    RETURN true;
  END IF;
  
  -- Check role-based permission
  SELECT can_access INTO v_role_permission
  FROM role_page_permissions
  WHERE brand_id = p_brand_id
  AND role = v_user_role::text
  AND page = p_page;
  
  -- If no explicit permission set, default to true (allow)
  RETURN COALESCE(v_role_permission, true);
END;
$$;

-- Function to check if column is hidden for user
CREATE OR REPLACE FUNCTION public.is_column_hidden_for_user(
  p_user_id uuid,
  p_brand_id uuid,
  p_table_name text,
  p_column_key text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_override boolean;
  v_role_hidden boolean;
  v_user_role app_role;
BEGIN
  -- Check for user-specific override first
  SELECT is_hidden INTO v_user_override
  FROM user_hidden_columns
  WHERE user_id = p_user_id
  AND brand_id = p_brand_id
  AND table_name = p_table_name
  AND column_key = p_column_key;
  
  IF v_user_override IS NOT NULL THEN
    RETURN v_user_override;
  END IF;
  
  -- Get user's role for this brand
  SELECT role INTO v_user_role
  FROM user_roles
  WHERE user_id = p_user_id
  AND brand_id = p_brand_id
  LIMIT 1;
  
  -- Admin and CEO can see everything
  IF v_user_role IN ('admin'::app_role, 'ceo'::app_role) THEN
    RETURN false;
  END IF;
  
  -- Check role-based hidden column
  SELECT is_hidden INTO v_role_hidden
  FROM role_hidden_columns
  WHERE brand_id = p_brand_id
  AND role = v_user_role::text
  AND table_name = p_table_name
  AND column_key = p_column_key;
  
  -- If no explicit setting, default to visible (not hidden)
  RETURN COALESCE(v_role_hidden, false);
END;
$$;

-- RPC to get all permissions for current user (for UI)
CREATE OR REPLACE FUNCTION public.get_my_permissions(p_brand_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_user_role app_role;
  v_pages jsonb;
  v_hidden_columns jsonb;
BEGIN
  -- Get internal user ID
  SELECT u.id INTO v_user_id
  FROM users u
  WHERE u.supabase_auth_id = auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('pages', '[]'::jsonb, 'hidden_columns', '[]'::jsonb);
  END IF;
  
  -- Get user's role
  SELECT role INTO v_user_role
  FROM user_roles
  WHERE user_id = v_user_id
  AND brand_id = p_brand_id
  LIMIT 1;
  
  -- Build pages permissions
  SELECT jsonb_agg(jsonb_build_object(
    'page', p.page::text,
    'can_access', COALESCE(
      up.can_access,
      rp.can_access,
      CASE WHEN v_user_role IN ('admin'::app_role, 'ceo'::app_role) THEN true ELSE true END
    )
  ))
  INTO v_pages
  FROM unnest(enum_range(NULL::app_page)) AS p(page)
  LEFT JOIN user_page_permissions up ON up.user_id = v_user_id AND up.brand_id = p_brand_id AND up.page = p.page
  LEFT JOIN role_page_permissions rp ON rp.brand_id = p_brand_id AND rp.role = v_user_role::text AND rp.page = p.page;
  
  -- Build hidden columns
  SELECT jsonb_agg(jsonb_build_object(
    'table_name', COALESCE(uh.table_name, rh.table_name),
    'column_key', COALESCE(uh.column_key, rh.column_key),
    'is_hidden', COALESCE(uh.is_hidden, rh.is_hidden)
  ))
  INTO v_hidden_columns
  FROM (
    SELECT table_name, column_key, is_hidden FROM user_hidden_columns WHERE user_id = v_user_id AND brand_id = p_brand_id
    UNION
    SELECT table_name, column_key, is_hidden FROM role_hidden_columns WHERE brand_id = p_brand_id AND role = v_user_role::text
    AND NOT EXISTS (
      SELECT 1 FROM user_hidden_columns 
      WHERE user_id = v_user_id AND brand_id = p_brand_id 
      AND table_name = role_hidden_columns.table_name 
      AND column_key = role_hidden_columns.column_key
    )
  ) combined
  LEFT JOIN user_hidden_columns uh ON uh.user_id = v_user_id AND uh.brand_id = p_brand_id AND uh.table_name = combined.table_name AND uh.column_key = combined.column_key
  LEFT JOIN role_hidden_columns rh ON rh.brand_id = p_brand_id AND rh.role = v_user_role::text AND rh.table_name = combined.table_name AND rh.column_key = combined.column_key;
  
  RETURN jsonb_build_object(
    'user_id', v_user_id,
    'role', v_user_role::text,
    'pages', COALESCE(v_pages, '[]'::jsonb),
    'hidden_columns', COALESCE(v_hidden_columns, '[]'::jsonb)
  );
END;
$$;