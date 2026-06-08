-- Tighten system_settings SELECT to admin/CEO only (was: any authenticated user).
DROP POLICY IF EXISTS system_settings_read_authenticated ON public.system_settings;

CREATE POLICY system_settings_read_admin_ceo
  ON public.system_settings
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(public.get_user_id(auth.uid()), 'admin'::app_role)
    OR public.has_role(public.get_user_id(auth.uid()), 'ceo'::app_role)
  );

-- Add deny-by-default explicit policies on auth-challenge tables so linter
-- (rls_enabled_no_policy) is satisfied. These tables are written/read only by
-- edge functions using the service role, which bypasses RLS.
CREATE POLICY pin_login_challenges_no_client_access
  ON public.pin_login_challenges
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY passkey_auth_challenges_no_client_access
  ON public.passkey_auth_challenges
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);