-- ===========================================================
-- M2: BRAND HIERARCHY + CROSS-BRAND ACCESS
-- ===========================================================

-- Add parent_brand_id to brands table for hierarchy
ALTER TABLE public.brands
ADD COLUMN parent_brand_id UUID REFERENCES public.brands(id) ON DELETE SET NULL;

CREATE INDEX idx_brands_parent ON public.brands(parent_brand_id) WHERE parent_brand_id IS NOT NULL;

-- Add can_access_children flag to user_roles for hierarchical access
ALTER TABLE public.user_roles
ADD COLUMN can_access_children BOOLEAN NOT NULL DEFAULT false;

-- ===========================================================
-- Function: Get all accessible brand IDs for a user
-- Returns brands directly assigned + child brands if can_access_children
-- ===========================================================
CREATE OR REPLACE FUNCTION public.get_accessible_brand_ids(p_user_id UUID)
RETURNS UUID[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_direct_brands UUID[];
  v_child_brands UUID[];
  v_parent_brands_with_children UUID[];
BEGIN
  -- Get directly assigned brands
  SELECT array_agg(ur.brand_id) INTO v_direct_brands
  FROM user_roles ur
  WHERE ur.user_id = p_user_id;
  
  IF v_direct_brands IS NULL THEN
    RETURN ARRAY[]::UUID[];
  END IF;
  
  -- Get parent brands where user has can_access_children = true
  SELECT array_agg(ur.brand_id) INTO v_parent_brands_with_children
  FROM user_roles ur
  WHERE ur.user_id = p_user_id AND ur.can_access_children = true;
  
  -- Get child brands of those parents
  IF v_parent_brands_with_children IS NOT NULL THEN
    SELECT array_agg(b.id) INTO v_child_brands
    FROM brands b
    WHERE b.parent_brand_id = ANY(v_parent_brands_with_children);
  END IF;
  
  -- Combine and return unique brand IDs
  RETURN ARRAY(
    SELECT DISTINCT unnest(
      array_cat(
        COALESCE(v_direct_brands, ARRAY[]::UUID[]),
        COALESCE(v_child_brands, ARRAY[]::UUID[])
      )
    )
  );
END;
$$;

-- ===========================================================
-- Function: Check if user can access a specific brand
-- ===========================================================
CREATE OR REPLACE FUNCTION public.user_can_access_brand(p_user_id UUID, p_brand_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Direct access
  IF EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = p_user_id AND ur.brand_id = p_brand_id
  ) THEN
    RETURN true;
  END IF;
  
  -- Check if user has parent brand with can_access_children
  RETURN EXISTS (
    SELECT 1 
    FROM user_roles ur
    JOIN brands b ON b.parent_brand_id = ur.brand_id
    WHERE ur.user_id = p_user_id 
      AND ur.can_access_children = true
      AND b.id = p_brand_id
  );
END;
$$;

-- ===========================================================
-- Table: contact_table_views (for M4 - saved table configurations)
-- Creating now to avoid future migration
-- ===========================================================
CREATE TYPE public.table_view_scope AS ENUM ('single_brand', 'all_accessible');

CREATE TABLE public.contact_table_views (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_scope public.table_view_scope NOT NULL DEFAULT 'single_brand',
  brand_id UUID REFERENCES public.brands(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  columns JSONB NOT NULL DEFAULT '[]'::jsonb,
  filters JSONB DEFAULT '{}'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT valid_view_scope CHECK (
    (brand_scope = 'all_accessible' AND brand_id IS NULL) OR
    (brand_scope = 'single_brand' AND brand_id IS NOT NULL)
  )
);

CREATE INDEX idx_table_views_owner ON public.contact_table_views(owner_user_id);
CREATE INDEX idx_table_views_brand ON public.contact_table_views(brand_id) WHERE brand_id IS NOT NULL;

ALTER TABLE public.contact_table_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own table views"
ON public.contact_table_views
FOR ALL
USING (owner_user_id = auth.uid());

CREATE TRIGGER update_table_views_updated_at
BEFORE UPDATE ON public.contact_table_views
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- ===========================================================
-- Update RLS for contacts to use hierarchical access
-- Drop existing policy and create new one
-- ===========================================================
-- Note: We add a new policy that uses the function, keeping backward compatibility

CREATE POLICY "Users can view contacts via brand hierarchy"
ON public.contacts
FOR SELECT
USING (
  public.user_can_access_brand(auth.uid(), brand_id)
);

-- ===========================================================
-- Function: Get brands with hierarchy info
-- ===========================================================
CREATE OR REPLACE FUNCTION public.get_brands_with_hierarchy(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  slug TEXT,
  parent_brand_id UUID,
  parent_brand_name TEXT,
  is_parent BOOLEAN,
  child_count INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH accessible AS (
    SELECT unnest(public.get_accessible_brand_ids(p_user_id)) AS brand_id
  ),
  child_counts AS (
    SELECT parent_brand_id, COUNT(*) as cnt
    FROM brands
    WHERE parent_brand_id IS NOT NULL
    GROUP BY parent_brand_id
  )
  SELECT 
    b.id,
    b.name,
    b.slug,
    b.parent_brand_id,
    pb.name as parent_brand_name,
    COALESCE(cc.cnt, 0) > 0 as is_parent,
    COALESCE(cc.cnt, 0)::integer as child_count
  FROM brands b
  JOIN accessible a ON a.brand_id = b.id
  LEFT JOIN brands pb ON pb.id = b.parent_brand_id
  LEFT JOIN child_counts cc ON cc.parent_brand_id = b.id
  ORDER BY b.name;
$$;