
-- Fix find_or_create_deal to use global pipeline stages (brand_id IS NULL)
CREATE OR REPLACE FUNCTION public.find_or_create_deal(
  p_brand_id UUID,
  p_contact_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deal_id UUID;
  v_initial_stage_id UUID;
BEGIN
  -- 1. Trova lo stage iniziale GLOBALE (brand_id IS NULL)
  SELECT id INTO v_initial_stage_id
  FROM public.pipeline_stages
  WHERE brand_id IS NULL 
    AND is_active = true
  ORDER BY order_index ASC
  LIMIT 1;

  -- 2. Prova INSERT con ON CONFLICT (sfrutta indice parziale)
  INSERT INTO public.deals (brand_id, contact_id, current_stage_id, status)
  VALUES (p_brand_id, p_contact_id, v_initial_stage_id, 'open')
  ON CONFLICT (brand_id, contact_id) WHERE status IN ('open', 'reopened_for_support')
  DO NOTHING
  RETURNING id INTO v_deal_id;

  -- 3. Se INSERT ha funzionato (nuovo deal), registra history
  IF v_deal_id IS NOT NULL THEN
    INSERT INTO public.deal_stage_history (deal_id, from_stage_id, to_stage_id, notes)
    VALUES (v_deal_id, NULL, v_initial_stage_id, 'Deal creato automaticamente');
    
    RETURN v_deal_id;
  END IF;

  -- 4. Deal già esistente, recupera ID
  SELECT id INTO v_deal_id
  FROM public.deals
  WHERE brand_id = p_brand_id 
    AND contact_id = p_contact_id
    AND status IN ('open', 'reopened_for_support')
  LIMIT 1;

  RETURN v_deal_id;
END;
$$;
