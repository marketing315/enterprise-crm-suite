
-- Pipeline stages table (anticipato da M2)
CREATE TABLE public.pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  order_index INT NOT NULL DEFAULT 0,
  color TEXT DEFAULT '#6366f1',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(brand_id, name)
);

CREATE INDEX idx_pipeline_stages_brand ON public.pipeline_stages(brand_id, order_index);

CREATE TRIGGER update_pipeline_stages_updated_at
  BEFORE UPDATE ON public.pipeline_stages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view stages in their brands"
  ON public.pipeline_stages FOR SELECT
  USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

CREATE POLICY "Admins can manage stages"
  ON public.pipeline_stages FOR ALL
  USING (has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'))
  WITH CHECK (has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'));

-- Seed 3 pipeline stages per brand Excell
INSERT INTO public.pipeline_stages (brand_id, name, description, order_index, color)
SELECT 
  id,
  stage.name,
  stage.description,
  stage.order_index,
  stage.color
FROM public.brands, 
(VALUES 
  ('Nuovo Lead', 'Lead appena arrivato da webhook', 0, '#3b82f6'),
  ('In Lavorazione', 'Contatto in corso con il cliente', 1, '#f59e0b'),
  ('Qualificato', 'Lead qualificato pronto per appuntamento', 2, '#22c55e')
) AS stage(name, description, order_index, color)
WHERE brands.slug = 'excell';
