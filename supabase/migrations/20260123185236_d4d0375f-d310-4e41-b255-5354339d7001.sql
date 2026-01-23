
-- M2.3: Funzione per trovare o creare deal per un evento

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
  -- 1. Cerca deal esistente open/reopened per questo contatto+brand
  SELECT id INTO v_deal_id
  FROM public.deals
  WHERE brand_id = p_brand_id 
    AND contact_id = p_contact_id
    AND status IN ('open', 'reopened_for_support')
  LIMIT 1;

  -- 2. Se trovato, ritorna ID
  IF v_deal_id IS NOT NULL THEN
    RETURN v_deal_id;
  END IF;

  -- 3. Trova lo stage iniziale (order_index più basso) per il brand
  SELECT id INTO v_initial_stage_id
  FROM public.pipeline_stages
  WHERE brand_id = p_brand_id 
    AND is_active = true
  ORDER BY order_index ASC
  LIMIT 1;

  -- 4. Crea nuovo deal
  INSERT INTO public.deals (brand_id, contact_id, current_stage_id, status)
  VALUES (p_brand_id, p_contact_id, v_initial_stage_id, 'open')
  RETURNING id INTO v_deal_id;

  -- 5. Registra stage iniziale nella history
  INSERT INTO public.deal_stage_history (deal_id, from_stage_id, to_stage_id, notes)
  VALUES (v_deal_id, NULL, v_initial_stage_id, 'Deal creato automaticamente');

  RETURN v_deal_id;
END;
$$;
