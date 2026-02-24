-- Fix RLS on deal_stage_transitions: use internal user ID via get_user_id()
DROP POLICY IF EXISTS "Users can insert transitions for their brands" ON deal_stage_transitions;
CREATE POLICY "Users can insert transitions for their brands"
  ON deal_stage_transitions FOR INSERT TO authenticated
  WITH CHECK (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

DROP POLICY IF EXISTS "Users can view transitions for their brands" ON deal_stage_transitions;
CREATE POLICY "Users can view transitions for their brands"
  ON deal_stage_transitions FOR SELECT TO authenticated
  USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));