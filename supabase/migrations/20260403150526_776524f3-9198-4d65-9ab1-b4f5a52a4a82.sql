
CREATE OR REPLACE FUNCTION public.find_or_create_deal(
  p_brand_id uuid,
  p_contact_id uuid,
  p_stage_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deal_id UUID;
  v_initial_stage_id UUID;
  v_current_stage_id UUID;
  v_current_order INT;
  v_requested_order INT;
BEGIN
  -- Use provided stage_id or fall back to first global stage
  IF p_stage_id IS NOT NULL THEN
    v_initial_stage_id := p_stage_id;
  ELSE
    SELECT id INTO v_initial_stage_id
    FROM public.pipeline_stages
    WHERE brand_id IS NULL 
      AND is_active = true
    ORDER BY order_index ASC
    LIMIT 1;
  END IF;

  -- Prova INSERT con ON CONFLICT (sfrutta indice parziale)
  INSERT INTO public.deals (brand_id, contact_id, current_stage_id, status)
  VALUES (p_brand_id, p_contact_id, v_initial_stage_id, 'open')
  ON CONFLICT (brand_id, contact_id) WHERE status IN ('open', 'reopened_for_support')
  DO NOTHING
  RETURNING id INTO v_deal_id;

  -- Se INSERT ha funzionato (nuovo deal), registra history
  IF v_deal_id IS NOT NULL THEN
    INSERT INTO public.deal_stage_history (deal_id, from_stage_id, to_stage_id, notes)
    VALUES (v_deal_id, NULL, v_initial_stage_id, 'Deal creato automaticamente');
    
    RETURN v_deal_id;
  END IF;

  -- Deal già esistente, recupera ID e fase corrente
  SELECT id, current_stage_id INTO v_deal_id, v_current_stage_id
  FROM public.deals
  WHERE brand_id = p_brand_id 
    AND contact_id = p_contact_id
    AND status IN ('open', 'reopened_for_support')
  LIMIT 1;

  -- Se è stata richiesta una fase specifica e il deal esiste, avanza se necessario
  IF v_deal_id IS NOT NULL AND p_stage_id IS NOT NULL AND v_current_stage_id IS DISTINCT FROM p_stage_id THEN
    -- Controlla se la fase del deal è bloccata dall'utente
    IF NOT COALESCE((SELECT stage_locked_by_user FROM public.deals WHERE id = v_deal_id), false) THEN
      -- Recupera order_index della fase corrente e di quella richiesta
      SELECT order_index INTO v_current_order FROM public.pipeline_stages WHERE id = v_current_stage_id;
      SELECT order_index INTO v_requested_order FROM public.pipeline_stages WHERE id = p_stage_id;

      -- Avanza solo se la fase richiesta è più avanzata (order_index maggiore)
      IF v_requested_order IS NOT NULL AND v_current_order IS NOT NULL AND v_requested_order > v_current_order THEN
        UPDATE public.deals
        SET current_stage_id = p_stage_id, updated_at = now()
        WHERE id = v_deal_id;

        INSERT INTO public.deal_stage_history (deal_id, from_stage_id, to_stage_id, notes)
        VALUES (v_deal_id, v_current_stage_id, p_stage_id, 'Avanzamento automatico da webhook');
      END IF;
    END IF;
  END IF;

  RETURN v_deal_id;
END;
$$;
