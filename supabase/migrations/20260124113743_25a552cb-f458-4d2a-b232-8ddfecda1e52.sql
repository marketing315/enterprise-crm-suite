-- ================================================
-- M3: HIERARCHICAL TAGS SYSTEM
-- ================================================

-- Create tag_scope enum
CREATE TYPE tag_scope AS ENUM ('contact', 'event', 'deal', 'appointment', 'ticket', 'mixed');

-- Create assigned_by enum
CREATE TYPE assigned_by AS ENUM ('ai', 'user', 'rule');

-- Create tags table (supports hierarchy via parent_id)
CREATE TABLE public.tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.tags(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6366f1',
  scope tag_scope NOT NULL DEFAULT 'mixed',
  is_active BOOLEAN NOT NULL DEFAULT true,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Ensure unique tag names within same parent and brand
  CONSTRAINT unique_tag_name_per_parent UNIQUE (brand_id, parent_id, name)
);

-- Create tag_assignments table (polymorphic assignment)
CREATE TABLE public.tag_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  
  -- Polymorphic references (only one should be non-null)
  contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
  lead_event_id UUID REFERENCES public.lead_events(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES public.deals(id) ON DELETE CASCADE,
  
  assigned_by assigned_by NOT NULL DEFAULT 'user',
  assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  assigned_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  confidence NUMERIC(3, 2), -- For AI assignments (0.00 to 1.00)
  
  -- Ensure tag is assigned to exactly one entity
  CONSTRAINT exactly_one_entity CHECK (
    (CASE WHEN contact_id IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN lead_event_id IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN deal_id IS NOT NULL THEN 1 ELSE 0 END) = 1
  ),
  
  -- Prevent duplicate tag assignments
  CONSTRAINT unique_contact_tag UNIQUE (tag_id, contact_id),
  CONSTRAINT unique_event_tag UNIQUE (tag_id, lead_event_id),
  CONSTRAINT unique_deal_tag UNIQUE (tag_id, deal_id)
);

-- Enable RLS
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tag_assignments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for tags
CREATE POLICY "Users can view tags in their brands"
  ON public.tags FOR SELECT
  USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

CREATE POLICY "Admins can manage tags"
  ON public.tags FOR ALL
  USING (has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'))
  WITH CHECK (has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'));

-- RLS Policies for tag_assignments
CREATE POLICY "Users can view tag assignments in their brands"
  ON public.tag_assignments FOR SELECT
  USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

CREATE POLICY "Users can create tag assignments in their brands"
  ON public.tag_assignments FOR INSERT
  WITH CHECK (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

CREATE POLICY "Users can delete tag assignments in their brands"
  ON public.tag_assignments FOR DELETE
  USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

-- Add updated_at trigger
CREATE TRIGGER update_tags_updated_at
  BEFORE UPDATE ON public.tags
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Performance indexes
CREATE INDEX idx_tags_brand_id ON public.tags(brand_id);
CREATE INDEX idx_tags_parent_id ON public.tags(parent_id);
CREATE INDEX idx_tags_scope ON public.tags(brand_id, scope);
CREATE INDEX idx_tag_assignments_brand_id ON public.tag_assignments(brand_id);
CREATE INDEX idx_tag_assignments_tag_id ON public.tag_assignments(tag_id);
CREATE INDEX idx_tag_assignments_contact_id ON public.tag_assignments(contact_id);
CREATE INDEX idx_tag_assignments_deal_id ON public.tag_assignments(deal_id);
CREATE INDEX idx_tag_assignments_event_id ON public.tag_assignments(lead_event_id);

-- Helper function to get tag tree for a brand
CREATE OR REPLACE FUNCTION public.get_tag_tree(p_brand_id UUID)
RETURNS TABLE (
  id UUID,
  parent_id UUID,
  name TEXT,
  description TEXT,
  color TEXT,
  scope tag_scope,
  is_active BOOLEAN,
  order_index INTEGER,
  depth INTEGER,
  path TEXT
)
LANGUAGE SQL
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE tag_tree AS (
    -- Root tags (no parent)
    SELECT 
      t.id, t.parent_id, t.name, t.description, t.color, t.scope, 
      t.is_active, t.order_index,
      0 AS depth,
      t.name::TEXT AS path
    FROM tags t
    WHERE t.brand_id = p_brand_id AND t.parent_id IS NULL
    
    UNION ALL
    
    -- Child tags
    SELECT 
      t.id, t.parent_id, t.name, t.description, t.color, t.scope,
      t.is_active, t.order_index,
      tt.depth + 1,
      tt.path || ' > ' || t.name
    FROM tags t
    INNER JOIN tag_tree tt ON t.parent_id = tt.id
    WHERE t.brand_id = p_brand_id
  )
  SELECT * FROM tag_tree ORDER BY path, order_index;
$$;

-- Function to count assignments for a tag
CREATE OR REPLACE FUNCTION public.get_tag_assignment_counts(p_brand_id UUID)
RETURNS TABLE (
  tag_id UUID,
  contact_count BIGINT,
  event_count BIGINT,
  deal_count BIGINT,
  total_count BIGINT
)
LANGUAGE SQL
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    ta.tag_id,
    COUNT(ta.contact_id) AS contact_count,
    COUNT(ta.lead_event_id) AS event_count,
    COUNT(ta.deal_id) AS deal_count,
    COUNT(*) AS total_count
  FROM tag_assignments ta
  WHERE ta.brand_id = p_brand_id
  GROUP BY ta.tag_id;
$$;