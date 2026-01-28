-- Create meta_apps table for per-brand Meta configuration
CREATE TABLE public.meta_apps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  brand_slug text NOT NULL,
  verify_token text NOT NULL,
  app_secret text NOT NULL,
  page_id text,
  access_token text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meta_apps_brand_slug_unique UNIQUE (brand_slug)
);

-- Indexes
CREATE INDEX idx_meta_apps_brand_id ON public.meta_apps(brand_id);
CREATE INDEX idx_meta_apps_brand_slug ON public.meta_apps(brand_slug);

-- Enable RLS
ALTER TABLE public.meta_apps ENABLE ROW LEVEL SECURITY;

-- RLS Policies (admin/ceo only for management, no direct frontend access to secrets)
CREATE POLICY "Admins and CEOs can manage meta apps"
  ON public.meta_apps FOR ALL
  USING (
    has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role)
    OR has_role(get_user_id(auth.uid()), 'ceo'::app_role)
  )
  WITH CHECK (
    has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role)
    OR has_role(get_user_id(auth.uid()), 'ceo'::app_role)
  );

-- Trigger for updated_at
CREATE TRIGGER update_meta_apps_updated_at
  BEFORE UPDATE ON public.meta_apps
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RPC to find meta app by brand slug (for edge function, no RLS bypass needed since service role)
CREATE OR REPLACE FUNCTION public.find_meta_app_by_slug(p_brand_slug text)
RETURNS TABLE (
  id uuid,
  brand_id uuid,
  brand_slug text,
  verify_token text,
  app_secret text,
  page_id text,
  access_token text,
  is_active boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    ma.id,
    ma.brand_id,
    ma.brand_slug,
    ma.verify_token,
    ma.app_secret,
    ma.page_id,
    ma.access_token,
    ma.is_active
  FROM public.meta_apps ma
  WHERE ma.brand_slug = p_brand_slug
  LIMIT 1;
$$;

-- Add external_id to lead_events for deduplication
ALTER TABLE public.lead_events 
ADD COLUMN IF NOT EXISTS external_id text;

-- Create unique index for deduplication (brand_id, source, external_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_events_dedupe 
ON public.lead_events(brand_id, source, external_id) 
WHERE external_id IS NOT NULL;