
-- Bug #13: Fix RLS policies for contact_table_views
-- Remove the generic ALL policy targeting public role (includes anon)
-- Replace with 4 granular policies for authenticated role only

DROP POLICY IF EXISTS "Users can manage their own table views" ON contact_table_views;

CREATE POLICY "Users can view own table views"
  ON contact_table_views FOR SELECT
  TO authenticated
  USING (owner_user_id = auth.uid());

CREATE POLICY "Users can insert own table views"
  ON contact_table_views FOR INSERT
  TO authenticated
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "Users can update own table views"
  ON contact_table_views FOR UPDATE
  TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "Users can delete own table views"
  ON contact_table_views FOR DELETE
  TO authenticated
  USING (owner_user_id = auth.uid());
