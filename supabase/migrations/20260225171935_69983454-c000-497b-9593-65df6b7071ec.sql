
-- Keplero Contact Lookup settings (global + per-brand override)
CREATE TABLE public.keplero_lookup_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES public.brands(id) ON DELETE CASCADE,
  is_enabled boolean NOT NULL DEFAULT false,
  response_profile text NOT NULL DEFAULT 'standard',
  extra_fields jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  CONSTRAINT uq_keplero_lookup_brand UNIQUE (brand_id)
);

-- NULL brand_id = global setting, non-null = brand override
COMMENT ON TABLE public.keplero_lookup_settings IS 'Keplero contact lookup endpoint configuration (global + brand override)';

-- Keplero lookup secrets
CREATE TABLE public.keplero_lookup_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES public.brands(id) ON DELETE CASCADE,
  secret_hash text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  rotated_at timestamptz,
  created_by uuid REFERENCES auth.users(id)
);

COMMENT ON TABLE public.keplero_lookup_secrets IS 'Secrets for Keplero contact lookup endpoint authentication';

-- RLS
ALTER TABLE public.keplero_lookup_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.keplero_lookup_secrets ENABLE ROW LEVEL SECURITY;

-- Admin-only policies
CREATE POLICY "admin_manage_keplero_lookup_settings"
  ON public.keplero_lookup_settings
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin', 'ceo')
        AND (keplero_lookup_settings.brand_id IS NULL OR ur.brand_id = keplero_lookup_settings.brand_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin', 'ceo')
        AND (keplero_lookup_settings.brand_id IS NULL OR ur.brand_id = keplero_lookup_settings.brand_id)
    )
  );

CREATE POLICY "admin_manage_keplero_lookup_secrets"
  ON public.keplero_lookup_secrets
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin', 'ceo')
        AND (keplero_lookup_secrets.brand_id IS NULL OR ur.brand_id = keplero_lookup_secrets.brand_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin', 'ceo')
        AND (keplero_lookup_secrets.brand_id IS NULL OR ur.brand_id = keplero_lookup_secrets.brand_id)
    )
  );
