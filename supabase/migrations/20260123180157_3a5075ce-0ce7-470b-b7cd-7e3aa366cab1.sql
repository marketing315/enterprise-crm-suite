-- ================================================
-- M0: CRM Enterprise Multi-Brand - Core Schema
-- ================================================

-- 1. ENUMS
-- ------------------------------------------------
CREATE TYPE public.app_role AS ENUM ('admin', 'ceo', 'callcenter', 'sales');

-- 2. BRANDS TABLE
-- ------------------------------------------------
CREATE TABLE public.brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;

-- 3. USERS TABLE (profiles linked to auth.users)
-- ------------------------------------------------
CREATE TABLE public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supabase_auth_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 4. USER_ROLES TABLE (role per brand)
-- ------------------------------------------------
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, brand_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 5. HELPER FUNCTIONS (SECURITY DEFINER to avoid RLS recursion)
-- ------------------------------------------------

-- Get user's internal ID from auth.uid()
CREATE OR REPLACE FUNCTION public.get_user_id(_auth_uid UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.users WHERE supabase_auth_id = _auth_uid LIMIT 1
$$;

-- Check if user has a specific role (any brand)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Check if user has a specific role for a specific brand
CREATE OR REPLACE FUNCTION public.has_role_for_brand(_user_id UUID, _brand_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND brand_id = _brand_id AND role = _role
  )
$$;

-- Get all brand IDs the user has access to
CREATE OR REPLACE FUNCTION public.get_user_brand_ids(_user_id UUID)
RETURNS UUID[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(ARRAY_AGG(DISTINCT brand_id), ARRAY[]::UUID[])
  FROM public.user_roles
  WHERE user_id = _user_id
$$;

-- Check if user belongs to a brand
CREATE OR REPLACE FUNCTION public.user_belongs_to_brand(_user_id UUID, _brand_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND brand_id = _brand_id
  )
$$;

-- 6. RLS POLICIES
-- ------------------------------------------------

-- BRANDS: Users can only see brands they belong to
CREATE POLICY "Users can view their brands"
ON public.brands FOR SELECT TO authenticated
USING (
  id = ANY(
    public.get_user_brand_ids(
      public.get_user_id(auth.uid())
    )
  )
);

-- BRANDS: Only admins can insert brands
CREATE POLICY "Admins can insert brands"
ON public.brands FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(public.get_user_id(auth.uid()), 'admin')
);

-- BRANDS: Only admins can update brands
CREATE POLICY "Admins can update brands"
ON public.brands FOR UPDATE TO authenticated
USING (
  public.has_role(public.get_user_id(auth.uid()), 'admin')
  AND id = ANY(public.get_user_brand_ids(public.get_user_id(auth.uid())))
);

-- USERS: Users can view themselves
CREATE POLICY "Users can view themselves"
ON public.users FOR SELECT TO authenticated
USING (supabase_auth_id = auth.uid());

-- USERS: Users can update themselves
CREATE POLICY "Users can update themselves"
ON public.users FOR UPDATE TO authenticated
USING (supabase_auth_id = auth.uid());

-- USERS: Allow insert for new signups (via trigger)
CREATE POLICY "Users can insert themselves"
ON public.users FOR INSERT TO authenticated
WITH CHECK (supabase_auth_id = auth.uid());

-- USER_ROLES: Users can view their own roles
CREATE POLICY "Users can view their roles"
ON public.user_roles FOR SELECT TO authenticated
USING (
  user_id = public.get_user_id(auth.uid())
);

-- USER_ROLES: Only admins can manage roles
CREATE POLICY "Admins can manage roles"
ON public.user_roles FOR ALL TO authenticated
USING (
  public.has_role(public.get_user_id(auth.uid()), 'admin')
)
WITH CHECK (
  public.has_role(public.get_user_id(auth.uid()), 'admin')
);

-- 7. TRIGGERS
-- ------------------------------------------------

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_brands_updated_at
BEFORE UPDATE ON public.brands
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_users_updated_at
BEFORE UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (supabase_auth_id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();