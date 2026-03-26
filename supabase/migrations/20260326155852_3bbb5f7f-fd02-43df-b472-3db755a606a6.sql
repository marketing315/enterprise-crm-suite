
-- 1. Add default_pipeline_stage_id column to webhook_sources
ALTER TABLE public.webhook_sources 
ADD COLUMN default_pipeline_stage_id uuid 
REFERENCES public.pipeline_stages(id) ON DELETE SET NULL;

-- 2. Recreate the safe view to include the new column
DROP VIEW IF EXISTS public.webhook_sources_safe;

CREATE VIEW public.webhook_sources_safe
WITH (security_invoker = true) AS
SELECT 
  id, brand_id, name, description, is_active, rate_limit_per_min,
  hmac_enabled, replay_window_seconds, counts_as_new_lead, 
  default_pipeline_stage_id,
  created_at, updated_at
FROM public.webhook_sources;

GRANT SELECT ON public.webhook_sources_safe TO authenticated;

-- 3. Update find_or_create_deal to accept an optional stage override
CREATE OR REPLACE FUNCTION public.find_or_create_deal(
  p_brand_id UUID,
  p_contact_id UUID,
  p_stage_id UUID DEFAULT NULL
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

  -- Deal già esistente, recupera ID
  SELECT id INTO v_deal_id
  FROM public.deals
  WHERE brand_id = p_brand_id 
    AND contact_id = p_contact_id
    AND status IN ('open', 'reopened_for_support')
  LIMIT 1;

  RETURN v_deal_id;
END;
$$;
