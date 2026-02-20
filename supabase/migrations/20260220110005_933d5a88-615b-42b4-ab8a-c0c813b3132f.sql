-- Add SELECT policy so regular users can read their own module access overrides
CREATE POLICY "Users can read own module access"
  ON public.user_module_access
  FOR SELECT
  USING (user_id = public.current_app_user_id());

-- Keep existing admin policy for INSERT/UPDATE/DELETE (already covers ALL for admins)