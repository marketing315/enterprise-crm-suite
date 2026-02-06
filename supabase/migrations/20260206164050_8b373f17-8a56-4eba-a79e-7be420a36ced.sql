-- Create a SECURITY DEFINER function to map auth.uid() -> public.users.id
CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.users WHERE supabase_auth_id = auth.uid() LIMIT 1
$$;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own table views" ON contact_table_views;
DROP POLICY IF EXISTS "Users can insert own table views" ON contact_table_views;
DROP POLICY IF EXISTS "Users can update own table views" ON contact_table_views;
DROP POLICY IF EXISTS "Users can delete own table views" ON contact_table_views;

-- Recreate policies using current_app_user_id() instead of auth.uid()
CREATE POLICY "Users can view own table views"
  ON contact_table_views FOR SELECT
  TO authenticated
  USING (owner_user_id = public.current_app_user_id());

CREATE POLICY "Users can insert own table views"
  ON contact_table_views FOR INSERT
  TO authenticated
  WITH CHECK (owner_user_id = public.current_app_user_id());

CREATE POLICY "Users can update own table views"
  ON contact_table_views FOR UPDATE
  TO authenticated
  USING (owner_user_id = public.current_app_user_id())
  WITH CHECK (owner_user_id = public.current_app_user_id());

CREATE POLICY "Users can delete own table views"
  ON contact_table_views FOR DELETE
  TO authenticated
  USING (owner_user_id = public.current_app_user_id());