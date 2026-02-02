
-- =====================================================
-- Migration: Make pipeline_stages global (not per-brand)
-- =====================================================

-- 1. Drop the existing foreign key constraint on brand_id
ALTER TABLE public.pipeline_stages 
  DROP CONSTRAINT IF EXISTS pipeline_stages_brand_id_fkey;

-- 2. Make brand_id nullable (we'll keep it null for global stages)
ALTER TABLE public.pipeline_stages 
  ALTER COLUMN brand_id DROP NOT NULL;

-- 3. Set all existing stages' brand_id to NULL to make them global
UPDATE public.pipeline_stages 
SET brand_id = NULL;

-- 4. Drop the unique constraint that includes brand_id
ALTER TABLE public.pipeline_stages 
  DROP CONSTRAINT IF EXISTS pipeline_stages_brand_id_name_key;

-- 5. Add a new unique constraint just on name (global uniqueness)
ALTER TABLE public.pipeline_stages 
  ADD CONSTRAINT pipeline_stages_name_key UNIQUE (name);

-- 6. Update RLS policies to allow all authenticated users to view stages
DROP POLICY IF EXISTS "Users can view pipeline stages" ON public.pipeline_stages;
DROP POLICY IF EXISTS "Users can view pipeline stages in their brands" ON public.pipeline_stages;
DROP POLICY IF EXISTS "Admins can manage pipeline stages" ON public.pipeline_stages;

-- Anyone authenticated can view pipeline stages (they're global)
CREATE POLICY "Authenticated users can view pipeline stages"
ON public.pipeline_stages
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Only admins and CEOs can manage pipeline stages
CREATE POLICY "Admins and CEOs can manage pipeline stages"
ON public.pipeline_stages
FOR ALL
USING (
  has_role(get_user_id(auth.uid()), 'admin'::app_role) 
  OR has_role(get_user_id(auth.uid()), 'ceo'::app_role)
)
WITH CHECK (
  has_role(get_user_id(auth.uid()), 'admin'::app_role) 
  OR has_role(get_user_id(auth.uid()), 'ceo'::app_role)
);

-- 7. Update the create_pipeline_stage function to not require brand_id
CREATE OR REPLACE FUNCTION public.create_pipeline_stage(
  p_name TEXT,
  p_color TEXT DEFAULT '#6366f1',
  p_brand_id UUID DEFAULT NULL  -- Keep parameter for backwards compatibility but ignore it
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_id UUID;
  v_max_order INT;
  v_user_id UUID;
BEGIN
  -- Get user_id from auth
  v_user_id := get_user_id(auth.uid());
  
  -- Check if user is admin or CEO
  IF NOT (has_role(v_user_id, 'admin'::app_role) OR has_role(v_user_id, 'ceo'::app_role)) THEN
    RAISE EXCEPTION 'Solo admin e CEO possono creare fasi pipeline';
  END IF;
  
  -- Get max order_index for global stages
  SELECT COALESCE(MAX(order_index), -1) INTO v_max_order
  FROM pipeline_stages
  WHERE is_active = true;
  
  -- Insert new stage (global, no brand_id)
  INSERT INTO pipeline_stages (name, color, order_index, brand_id)
  VALUES (p_name, p_color, v_max_order + 1, NULL)
  RETURNING id INTO v_new_id;
  
  RETURN v_new_id;
END;
$$;

-- 8. Update deactivate_pipeline_stage to work globally
CREATE OR REPLACE FUNCTION public.deactivate_pipeline_stage(
  p_stage_id UUID,
  p_fallback_stage_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_stage_name TEXT;
  v_fallback_name TEXT;
  v_deals_moved INT;
BEGIN
  v_user_id := get_user_id(auth.uid());
  
  -- Check if user is admin or CEO
  IF NOT (has_role(v_user_id, 'admin'::app_role) OR has_role(v_user_id, 'ceo'::app_role)) THEN
    RAISE EXCEPTION 'Solo admin e CEO possono disattivare fasi pipeline';
  END IF;
  
  -- Get stage names
  SELECT name INTO v_stage_name FROM pipeline_stages WHERE id = p_stage_id;
  SELECT name INTO v_fallback_name FROM pipeline_stages WHERE id = p_fallback_stage_id;
  
  IF v_stage_name IS NULL THEN
    RAISE EXCEPTION 'Fase non trovata';
  END IF;
  
  IF v_fallback_name IS NULL THEN
    RAISE EXCEPTION 'Fase di fallback non trovata';
  END IF;
  
  -- Move deals to fallback stage (across all brands)
  UPDATE deals
  SET current_stage_id = p_fallback_stage_id,
      updated_at = NOW()
  WHERE current_stage_id = p_stage_id
    AND status IN ('open', 'reopened_for_support');
  
  GET DIAGNOSTICS v_deals_moved = ROW_COUNT;
  
  -- Deactivate the stage
  UPDATE pipeline_stages
  SET is_active = false,
      updated_at = NOW()
  WHERE id = p_stage_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'stage_name', v_stage_name,
    'fallback_name', v_fallback_name,
    'deals_moved', v_deals_moved
  );
END;
$$;

-- 9. Update reactivate_pipeline_stage to work globally
CREATE OR REPLACE FUNCTION public.reactivate_pipeline_stage(
  p_stage_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_stage_name TEXT;
  v_max_order INT;
BEGIN
  v_user_id := get_user_id(auth.uid());
  
  -- Check if user is admin or CEO
  IF NOT (has_role(v_user_id, 'admin'::app_role) OR has_role(v_user_id, 'ceo'::app_role)) THEN
    RAISE EXCEPTION 'Solo admin e CEO possono riattivare fasi pipeline';
  END IF;
  
  -- Get stage name
  SELECT name INTO v_stage_name FROM pipeline_stages WHERE id = p_stage_id;
  
  IF v_stage_name IS NULL THEN
    RAISE EXCEPTION 'Fase non trovata';
  END IF;
  
  -- Get max order for active stages
  SELECT COALESCE(MAX(order_index), -1) INTO v_max_order
  FROM pipeline_stages
  WHERE is_active = true;
  
  -- Reactivate the stage
  UPDATE pipeline_stages
  SET is_active = true,
      order_index = v_max_order + 1,
      updated_at = NOW()
  WHERE id = p_stage_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'stage_name', v_stage_name
  );
END;
$$;

-- 10. Update delete_pipeline_stage_permanently to work globally
CREATE OR REPLACE FUNCTION public.delete_pipeline_stage_permanently(
  p_stage_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_stage_name TEXT;
  v_deal_count INT;
  v_history_count INT;
BEGIN
  v_user_id := get_user_id(auth.uid());
  
  -- Check if user is admin or CEO
  IF NOT (has_role(v_user_id, 'admin'::app_role) OR has_role(v_user_id, 'ceo'::app_role)) THEN
    RAISE EXCEPTION 'Solo admin e CEO possono eliminare fasi pipeline';
  END IF;
  
  -- Get stage name
  SELECT name INTO v_stage_name FROM pipeline_stages WHERE id = p_stage_id;
  
  IF v_stage_name IS NULL THEN
    RAISE EXCEPTION 'Fase non trovata';
  END IF;
  
  -- Check for deals in this stage
  SELECT COUNT(*) INTO v_deal_count
  FROM deals
  WHERE current_stage_id = p_stage_id;
  
  IF v_deal_count > 0 THEN
    RAISE EXCEPTION 'Impossibile eliminare: % deal ancora in questa fase', v_deal_count;
  END IF;
  
  -- Check for stage history
  SELECT COUNT(*) INTO v_history_count
  FROM deal_stage_history
  WHERE from_stage_id = p_stage_id OR to_stage_id = p_stage_id;
  
  IF v_history_count > 0 THEN
    RAISE EXCEPTION 'Impossibile eliminare: % record storici associati a questa fase', v_history_count;
  END IF;
  
  -- Delete the stage
  DELETE FROM pipeline_stages WHERE id = p_stage_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'stage_name', v_stage_name
  );
END;
$$;

-- 11. Update reorder_pipeline_stages to work globally
CREATE OR REPLACE FUNCTION public.reorder_pipeline_stages(
  p_stage_ids UUID[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  i INT;
BEGIN
  v_user_id := get_user_id(auth.uid());
  
  -- Check if user is admin or CEO
  IF NOT (has_role(v_user_id, 'admin'::app_role) OR has_role(v_user_id, 'ceo'::app_role)) THEN
    RAISE EXCEPTION 'Solo admin e CEO possono riordinare le fasi pipeline';
  END IF;
  
  -- Update order_index for each stage
  FOR i IN 1..array_length(p_stage_ids, 1) LOOP
    UPDATE pipeline_stages
    SET order_index = i - 1,
        updated_at = NOW()
    WHERE id = p_stage_ids[i];
  END LOOP;
END;
$$;

-- 12. Update update_pipeline_stage to work globally  
CREATE OR REPLACE FUNCTION public.update_pipeline_stage(
  p_stage_id UUID,
  p_name TEXT DEFAULT NULL,
  p_color TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := get_user_id(auth.uid());
  
  -- Check if user is admin or CEO
  IF NOT (has_role(v_user_id, 'admin'::app_role) OR has_role(v_user_id, 'ceo'::app_role)) THEN
    RAISE EXCEPTION 'Solo admin e CEO possono modificare fasi pipeline';
  END IF;
  
  UPDATE pipeline_stages
  SET 
    name = COALESCE(p_name, name),
    color = COALESCE(p_color, color),
    description = COALESCE(p_description, description),
    updated_at = NOW()
  WHERE id = p_stage_id;
END;
$$;
