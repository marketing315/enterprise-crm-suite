
-- Fix RLS: use current_app_user_id() to map auth.uid() to internal user_id
DROP POLICY IF EXISTS "admin_manage_keplero_lookup_settings" ON public.keplero_lookup_settings;
DROP POLICY IF EXISTS "admin_manage_keplero_lookup_secrets" ON public.keplero_lookup_secrets;

CREATE POLICY "admin_manage_keplero_lookup_settings"
  ON public.keplero_lookup_settings
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = public.current_app_user_id()
        AND ur.role IN ('admin', 'ceo')
        AND (keplero_lookup_settings.brand_id IS NULL OR ur.brand_id = keplero_lookup_settings.brand_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = public.current_app_user_id()
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
      WHERE ur.user_id = public.current_app_user_id()
        AND ur.role IN ('admin', 'ceo')
        AND (keplero_lookup_secrets.brand_id IS NULL OR ur.brand_id = keplero_lookup_secrets.brand_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = public.current_app_user_id()
        AND ur.role IN ('admin', 'ceo')
        AND (keplero_lookup_secrets.brand_id IS NULL OR ur.brand_id = keplero_lookup_secrets.brand_id)
    )
  );
