-- Fix broken RLS policies: ur.user_id = auth.uid() should be ur.user_id = get_user_id(auth.uid())
-- user_roles.user_id stores internal app user ID, auth.uid() returns Supabase Auth ID

-- 1. contact_field_definitions: Admins can manage field definitions
DROP POLICY "Admins can manage field definitions" ON public.contact_field_definitions;
CREATE POLICY "Admins can manage field definitions" ON public.contact_field_definitions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = get_user_id(auth.uid())
        AND ur.role = ANY (ARRAY['admin'::app_role, 'ceo'::app_role])
    )
  );

-- 2. contact_field_definitions: Users can read brand field definitions
DROP POLICY "Users can read brand field definitions" ON public.contact_field_definitions;
CREATE POLICY "Users can read brand field definitions" ON public.contact_field_definitions
  FOR SELECT USING (
    scope = 'brand'::custom_field_scope
    AND is_active = true
    AND EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = get_user_id(auth.uid())
        AND ur.brand_id = contact_field_definitions.brand_id
    )
  );

-- 3. contact_field_values: Users can view field values
DROP POLICY "Users can view field values" ON public.contact_field_values;
CREATE POLICY "Users can view field values" ON public.contact_field_values
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = get_user_id(auth.uid())
        AND ur.brand_id = contact_field_values.brand_id
    )
  );

-- 4. contact_field_values: Users can insert field values
DROP POLICY "Users can insert field values" ON public.contact_field_values;
CREATE POLICY "Users can insert field values" ON public.contact_field_values
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = get_user_id(auth.uid())
        AND ur.brand_id = contact_field_values.brand_id
    )
  );

-- 5. contact_field_values: Users can update field values
DROP POLICY "Users can update field values" ON public.contact_field_values;
CREATE POLICY "Users can update field values" ON public.contact_field_values
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = get_user_id(auth.uid())
        AND ur.brand_id = contact_field_values.brand_id
    )
  );

-- 6. contact_field_values: Users can delete field values
DROP POLICY "Users can delete field values" ON public.contact_field_values;
CREATE POLICY "Users can delete field values" ON public.contact_field_values
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = get_user_id(auth.uid())
        AND ur.brand_id = contact_field_values.brand_id
    )
  );

-- 7. feature_flags: Admins can manage feature flags
DROP POLICY "Admins can manage feature flags" ON public.feature_flags;
CREATE POLICY "Admins can manage feature flags" ON public.feature_flags
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = get_user_id(auth.uid())
        AND ur.brand_id = feature_flags.brand_id
        AND ur.role = 'admin'::app_role
    )
  );

-- 8. module_usage_events: Admins can read usage events
DROP POLICY "Admins can read usage events" ON public.module_usage_events;
CREATE POLICY "Admins can read usage events" ON public.module_usage_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = get_user_id(auth.uid())
        AND ur.brand_id = module_usage_events.brand_id
        AND ur.role = ANY (ARRAY['admin'::app_role, 'ceo'::app_role])
    )
  );

-- 9. module_usage_events: Fix INSERT policy (auth.uid() = user_id is wrong, user_id is internal ID)
DROP POLICY "Authenticated users can insert usage events" ON public.module_usage_events;
CREATE POLICY "Authenticated users can insert usage events" ON public.module_usage_events
  FOR INSERT WITH CHECK (
    user_id = get_user_id(auth.uid())
  );