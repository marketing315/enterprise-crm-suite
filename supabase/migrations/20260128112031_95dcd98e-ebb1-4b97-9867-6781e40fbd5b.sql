-- Fix brand management RLS policies for global admin access

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can insert brands" ON public.brands;
DROP POLICY IF EXISTS "Admins can update brands" ON public.brands;
DROP POLICY IF EXISTS "Users can view their brands" ON public.brands;

-- Admins (anyone with admin role on ANY brand) can manage ALL brands
-- This enables "global admin" functionality

-- SELECT: Users see their brands, Admins see ALL
CREATE POLICY "Users can view brands" 
ON public.brands FOR SELECT 
USING (
  -- User belongs to this brand OR is an admin (on any brand)
  id = ANY (get_user_brand_ids(get_user_id(auth.uid())))
  OR has_role(get_user_id(auth.uid()), 'admin'::app_role)
  OR has_role(get_user_id(auth.uid()), 'ceo'::app_role)
);

-- INSERT: Only admins can create new brands
CREATE POLICY "Admins can insert brands" 
ON public.brands FOR INSERT 
WITH CHECK (
  has_role(get_user_id(auth.uid()), 'admin'::app_role)
  OR has_role(get_user_id(auth.uid()), 'ceo'::app_role)
);

-- UPDATE: Admins can update any brand
CREATE POLICY "Admins can update brands" 
ON public.brands FOR UPDATE 
USING (
  has_role(get_user_id(auth.uid()), 'admin'::app_role)
  OR has_role(get_user_id(auth.uid()), 'ceo'::app_role)
);

-- DELETE: Admins can delete brands (NEW policy)
CREATE POLICY "Admins can delete brands" 
ON public.brands FOR DELETE 
USING (
  has_role(get_user_id(auth.uid()), 'admin'::app_role)
  OR has_role(get_user_id(auth.uid()), 'ceo'::app_role)
);