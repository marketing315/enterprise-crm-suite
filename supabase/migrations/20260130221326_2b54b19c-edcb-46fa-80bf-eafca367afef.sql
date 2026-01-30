
-- RPC per riattivare una fase pipeline
CREATE OR REPLACE FUNCTION reactivate_pipeline_stage(p_stage_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stage_name TEXT;
  v_brand_id UUID;
  v_max_order INT;
BEGIN
  -- Get stage info
  SELECT name, brand_id INTO v_stage_name, v_brand_id
  FROM pipeline_stages
  WHERE id = p_stage_id AND is_active = FALSE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fase non trovata o già attiva';
  END IF;
  
  -- Get max order_index for active stages
  SELECT COALESCE(MAX(order_index), 0) INTO v_max_order
  FROM pipeline_stages
  WHERE brand_id = v_brand_id AND is_active = TRUE;
  
  -- Reactivate the stage at the end
  UPDATE pipeline_stages
  SET is_active = TRUE,
      order_index = v_max_order + 1
  WHERE id = p_stage_id;
  
  RETURN jsonb_build_object(
    'success', TRUE,
    'stage_name', v_stage_name
  );
END;
$$;

-- RPC per eliminare definitivamente una fase pipeline (solo se disattivata e senza deal)
CREATE OR REPLACE FUNCTION delete_pipeline_stage_permanently(p_stage_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stage_name TEXT;
  v_is_active BOOLEAN;
  v_deals_count INT;
BEGIN
  -- Get stage info
  SELECT name, is_active INTO v_stage_name, v_is_active
  FROM pipeline_stages
  WHERE id = p_stage_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fase non trovata';
  END IF;
  
  IF v_is_active THEN
    RAISE EXCEPTION 'Impossibile eliminare una fase attiva. Disattivala prima.';
  END IF;
  
  -- Check if any deals (even closed) reference this stage
  SELECT COUNT(*) INTO v_deals_count
  FROM deals
  WHERE current_stage_id = p_stage_id;
  
  IF v_deals_count > 0 THEN
    RAISE EXCEPTION 'Impossibile eliminare: % deal ancora associati a questa fase', v_deals_count;
  END IF;
  
  -- Also check deal_stage_history for references
  SELECT COUNT(*) INTO v_deals_count
  FROM deal_stage_history
  WHERE from_stage_id = p_stage_id OR to_stage_id = p_stage_id;
  
  IF v_deals_count > 0 THEN
    RAISE EXCEPTION 'Impossibile eliminare: fase presente nella storia di % movimenti', v_deals_count;
  END IF;
  
  -- Safe to delete
  DELETE FROM pipeline_stages WHERE id = p_stage_id;
  
  RETURN jsonb_build_object(
    'success', TRUE,
    'stage_name', v_stage_name
  );
END;
$$;
