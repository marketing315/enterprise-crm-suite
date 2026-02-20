
CREATE TABLE public.user_module_access (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES public.users(id),
  UNIQUE(user_id, brand_id, module_key)
);

ALTER TABLE public.user_module_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage user module access"
  ON public.user_module_access
  FOR ALL
  TO authenticated
  USING (public.user_belongs_to_brand(auth.uid(), brand_id))
  WITH CHECK (public.user_belongs_to_brand(auth.uid(), brand_id));

CREATE INDEX idx_user_module_access_user_brand ON public.user_module_access(user_id, brand_id);
