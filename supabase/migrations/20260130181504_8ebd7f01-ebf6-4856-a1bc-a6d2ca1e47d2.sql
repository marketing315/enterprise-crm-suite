-- ===========================================================
-- M1: CUSTOM FIELDS SYSTEM (Corrected)
-- ===========================================================

-- Enum for field types
CREATE TYPE public.custom_field_type AS ENUM (
  'text', 'number', 'date', 'bool', 'select', 'multiselect', 'email', 'phone', 'url', 'textarea'
);

-- Enum for field scope
CREATE TYPE public.custom_field_scope AS ENUM ('global', 'brand');

-- ===========================================================
-- Table: contact_field_definitions
-- ===========================================================
CREATE TABLE public.contact_field_definitions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scope public.custom_field_scope NOT NULL DEFAULT 'brand',
  brand_id UUID REFERENCES public.brands(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  field_type public.custom_field_type NOT NULL DEFAULT 'text',
  options JSONB DEFAULT '[]'::jsonb,
  is_required BOOLEAN NOT NULL DEFAULT false,
  is_indexed BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_user_id UUID REFERENCES auth.users(id),
  
  CONSTRAINT valid_brand_scope CHECK (
    (scope = 'global' AND brand_id IS NULL) OR 
    (scope = 'brand' AND brand_id IS NOT NULL)
  )
);

-- Partial unique indexes for key uniqueness
CREATE UNIQUE INDEX idx_field_def_unique_global_key 
ON public.contact_field_definitions(key) 
WHERE scope = 'global';

CREATE UNIQUE INDEX idx_field_def_unique_brand_key 
ON public.contact_field_definitions(brand_id, key) 
WHERE scope = 'brand';

CREATE INDEX idx_field_definitions_brand ON public.contact_field_definitions(brand_id) WHERE brand_id IS NOT NULL;
CREATE INDEX idx_field_definitions_scope ON public.contact_field_definitions(scope);
CREATE INDEX idx_field_definitions_active ON public.contact_field_definitions(is_active) WHERE is_active = true;

-- ===========================================================
-- Table: contact_field_values
-- ===========================================================
CREATE TABLE public.contact_field_values (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  field_definition_id UUID NOT NULL REFERENCES public.contact_field_definitions(id) ON DELETE CASCADE,
  value_text TEXT,
  value_number NUMERIC,
  value_bool BOOLEAN,
  value_date DATE,
  value_json JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_user_id UUID REFERENCES auth.users(id),
  CONSTRAINT unique_contact_field UNIQUE (contact_id, field_definition_id)
);

CREATE INDEX idx_field_values_contact ON public.contact_field_values(contact_id);
CREATE INDEX idx_field_values_brand ON public.contact_field_values(brand_id);
CREATE INDEX idx_field_values_definition ON public.contact_field_values(field_definition_id);
CREATE INDEX idx_field_values_text_search ON public.contact_field_values(value_text) WHERE value_text IS NOT NULL;

-- ===========================================================
-- RLS Policies
-- ===========================================================
ALTER TABLE public.contact_field_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_field_values ENABLE ROW LEVEL SECURITY;

-- Field Definitions: admins can manage all
CREATE POLICY "Admins can manage field definitions"
ON public.contact_field_definitions
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'ceo')
  )
);

-- Users can read active global definitions
CREATE POLICY "Users can read active global field definitions"
ON public.contact_field_definitions
FOR SELECT
USING (scope = 'global' AND is_active = true);

-- Users can read brand definitions for their brands
CREATE POLICY "Users can read brand field definitions"
ON public.contact_field_definitions
FOR SELECT
USING (
  scope = 'brand' AND is_active = true AND
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.brand_id = contact_field_definitions.brand_id
  )
);

-- Field Values RLS
CREATE POLICY "Users can view field values"
ON public.contact_field_values
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.brand_id = contact_field_values.brand_id
  )
);

CREATE POLICY "Users can insert field values"
ON public.contact_field_values
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.brand_id = contact_field_values.brand_id
  )
);

CREATE POLICY "Users can update field values"
ON public.contact_field_values
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.brand_id = contact_field_values.brand_id
  )
);

CREATE POLICY "Users can delete field values"
ON public.contact_field_values
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.brand_id = contact_field_values.brand_id
  )
);

-- ===========================================================
-- Triggers for updated_at
-- ===========================================================
CREATE TRIGGER update_field_definitions_updated_at
BEFORE UPDATE ON public.contact_field_definitions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_field_values_updated_at
BEFORE UPDATE ON public.contact_field_values
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- ===========================================================
-- Helper function: get all field definitions for a brand
-- ===========================================================
CREATE OR REPLACE FUNCTION public.get_contact_field_definitions(p_brand_id UUID)
RETURNS TABLE (
  id UUID,
  scope public.custom_field_scope,
  brand_id UUID,
  key TEXT,
  label TEXT,
  description TEXT,
  field_type public.custom_field_type,
  options JSONB,
  is_required BOOLEAN,
  display_order INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    cfd.id,
    cfd.scope,
    cfd.brand_id,
    cfd.key,
    cfd.label,
    cfd.description,
    cfd.field_type,
    cfd.options,
    cfd.is_required,
    cfd.display_order
  FROM contact_field_definitions cfd
  WHERE cfd.is_active = true
    AND (cfd.scope = 'global' OR cfd.brand_id = p_brand_id)
  ORDER BY cfd.scope DESC, cfd.display_order, cfd.label;
$$;

-- ===========================================================
-- Function: upsert contact field values
-- ===========================================================
CREATE OR REPLACE FUNCTION public.upsert_contact_field_values(
  p_contact_id UUID,
  p_brand_id UUID,
  p_values JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item JSONB;
  v_field_def RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_values)
  LOOP
    SELECT * INTO v_field_def
    FROM contact_field_definitions
    WHERE id = (v_item->>'field_definition_id')::uuid
      AND is_active = true;
    
    IF v_field_def IS NULL THEN
      CONTINUE;
    END IF;
    
    INSERT INTO contact_field_values (
      contact_id, brand_id, field_definition_id,
      value_text, value_number, value_bool, value_date, value_json,
      updated_by_user_id
    )
    VALUES (
      p_contact_id,
      p_brand_id,
      v_field_def.id,
      CASE WHEN v_field_def.field_type IN ('text', 'email', 'phone', 'url', 'textarea', 'select') 
           THEN v_item->>'value' END,
      CASE WHEN v_field_def.field_type = 'number' 
           THEN (v_item->>'value')::numeric END,
      CASE WHEN v_field_def.field_type = 'bool' 
           THEN (v_item->>'value')::boolean END,
      CASE WHEN v_field_def.field_type = 'date' 
           THEN (v_item->>'value')::date END,
      CASE WHEN v_field_def.field_type = 'multiselect' 
           THEN v_item->'value' END,
      auth.uid()
    )
    ON CONFLICT (contact_id, field_definition_id) DO UPDATE SET
      value_text = EXCLUDED.value_text,
      value_number = EXCLUDED.value_number,
      value_bool = EXCLUDED.value_bool,
      value_date = EXCLUDED.value_date,
      value_json = EXCLUDED.value_json,
      updated_at = now(),
      updated_by_user_id = auth.uid();
    
    v_count := v_count + 1;
  END LOOP;
  
  RETURN jsonb_build_object('updated', v_count);
END;
$$;