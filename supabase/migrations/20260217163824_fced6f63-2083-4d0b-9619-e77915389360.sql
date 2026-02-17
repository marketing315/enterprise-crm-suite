
-- Drop the constraint that was left from partial state
ALTER TABLE public.chat_thread_members DROP CONSTRAINT IF EXISTS chat_thread_members_role_check;

-- Update existing admin -> owner
UPDATE public.chat_thread_members SET role = 'owner' WHERE role = 'admin';

-- Re-add constraint with correct values
ALTER TABLE public.chat_thread_members
  ADD CONSTRAINT chat_thread_members_role_check
  CHECK (role IN ('owner', 'moderator', 'member'));

-- thread_read_state table
CREATE TABLE IF NOT EXISTS public.thread_read_state (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  thread_id UUID NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, thread_id)
);
ALTER TABLE public.thread_read_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own read state" ON public.thread_read_state FOR SELECT USING (user_id = get_user_id(auth.uid()));
CREATE POLICY "Users can upsert own read state" ON public.thread_read_state FOR INSERT WITH CHECK (user_id = get_user_id(auth.uid()));
CREATE POLICY "Users can update own read state" ON public.thread_read_state FOR UPDATE USING (user_id = get_user_id(auth.uid()));

ALTER PUBLICATION supabase_realtime ADD TABLE public.thread_read_state;

-- RPCs
CREATE OR REPLACE FUNCTION public.rename_group_thread(p_thread_id UUID, p_new_title TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user_id UUID; v_role TEXT;
BEGIN
  v_user_id := get_user_id(auth.uid());
  SELECT role INTO v_role FROM chat_thread_members WHERE thread_id = p_thread_id AND user_id = v_user_id AND left_at IS NULL;
  IF v_role IS NULL OR v_role = 'member' THEN RAISE EXCEPTION 'Only owners and moderators can rename groups'; END IF;
  UPDATE chat_threads SET title = p_new_title, updated_at = now() WHERE id = p_thread_id AND type = 'group';
END; $$;

CREATE OR REPLACE FUNCTION public.add_group_member(p_thread_id UUID, p_new_user_id UUID, p_role TEXT DEFAULT 'member')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user_id UUID; v_actor_role TEXT; v_brand_id UUID;
BEGIN
  v_user_id := get_user_id(auth.uid());
  SELECT role INTO v_actor_role FROM chat_thread_members WHERE thread_id = p_thread_id AND user_id = v_user_id AND left_at IS NULL;
  IF v_actor_role IS NULL OR v_actor_role = 'member' THEN RAISE EXCEPTION 'Only owners and moderators can add members'; END IF;
  IF p_role = 'moderator' AND v_actor_role != 'owner' THEN RAISE EXCEPTION 'Only owners can add moderators'; END IF;
  SELECT brand_id INTO v_brand_id FROM chat_threads WHERE id = p_thread_id;
  IF NOT user_belongs_to_brand(p_new_user_id, v_brand_id) THEN RAISE EXCEPTION 'User does not belong to this brand'; END IF;
  INSERT INTO chat_thread_members (thread_id, user_id, role) VALUES (p_thread_id, p_new_user_id, p_role)
  ON CONFLICT (thread_id, user_id) DO UPDATE SET left_at = NULL, role = p_role, joined_at = now();
END; $$;

CREATE OR REPLACE FUNCTION public.remove_group_member(p_thread_id UUID, p_target_user_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user_id UUID; v_actor_role TEXT; v_target_role TEXT;
BEGIN
  v_user_id := get_user_id(auth.uid());
  IF v_user_id = p_target_user_id THEN
    UPDATE chat_thread_members SET left_at = now() WHERE thread_id = p_thread_id AND user_id = p_target_user_id AND left_at IS NULL;
    RETURN;
  END IF;
  SELECT role INTO v_actor_role FROM chat_thread_members WHERE thread_id = p_thread_id AND user_id = v_user_id AND left_at IS NULL;
  SELECT role INTO v_target_role FROM chat_thread_members WHERE thread_id = p_thread_id AND user_id = p_target_user_id AND left_at IS NULL;
  IF v_actor_role IS NULL OR v_actor_role = 'member' THEN RAISE EXCEPTION 'Only owners and moderators can remove members'; END IF;
  IF v_actor_role = 'moderator' AND v_target_role IN ('owner', 'moderator') THEN RAISE EXCEPTION 'Moderators cannot remove owners or other moderators'; END IF;
  IF v_target_role = 'owner' AND (SELECT COUNT(*) FROM chat_thread_members WHERE thread_id = p_thread_id AND role = 'owner' AND left_at IS NULL) <= 1 THEN
    RAISE EXCEPTION 'Cannot remove the last owner';
  END IF;
  UPDATE chat_thread_members SET left_at = now() WHERE thread_id = p_thread_id AND user_id = p_target_user_id AND left_at IS NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.get_unread_counts()
RETURNS TABLE(thread_id UUID, unread_count BIGINT) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.thread_id, COUNT(cm.id) AS unread_count
  FROM chat_thread_members m
  LEFT JOIN thread_read_state rs ON rs.thread_id = m.thread_id AND rs.user_id = m.user_id
  LEFT JOIN chat_messages cm ON cm.thread_id = m.thread_id 
    AND cm.created_at > COALESCE(rs.last_read_at, m.joined_at)
    AND cm.deleted_at IS NULL
    AND cm.sender_user_id IS DISTINCT FROM m.user_id
  WHERE m.user_id = get_user_id(auth.uid()) AND m.left_at IS NULL
  GROUP BY m.thread_id HAVING COUNT(cm.id) > 0;
$$;

CREATE OR REPLACE FUNCTION public.mark_thread_read(p_thread_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user_id UUID;
BEGIN
  v_user_id := get_user_id(auth.uid());
  INSERT INTO thread_read_state (user_id, thread_id, last_read_at) VALUES (v_user_id, p_thread_id, now())
  ON CONFLICT (user_id, thread_id) DO UPDATE SET last_read_at = now();
END; $$;

CREATE OR REPLACE FUNCTION public.create_group_chat(p_brand_id UUID, p_title TEXT, p_member_ids UUID[])
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_thread_id uuid; v_user_id uuid; v_member_id uuid;
BEGIN
  v_user_id := get_user_id(auth.uid());
  IF NOT user_belongs_to_brand(v_user_id, p_brand_id) THEN RAISE EXCEPTION 'User does not belong to this brand'; END IF;
  INSERT INTO chat_threads (brand_id, type, title, created_by) VALUES (p_brand_id, 'group', p_title, v_user_id) RETURNING id INTO v_thread_id;
  INSERT INTO chat_thread_members (thread_id, user_id, role) VALUES (v_thread_id, v_user_id, 'owner');
  FOREACH v_member_id IN ARRAY p_member_ids LOOP
    IF v_member_id != v_user_id AND user_belongs_to_brand(v_member_id, p_brand_id) THEN
      INSERT INTO chat_thread_members (thread_id, user_id, role) VALUES (v_thread_id, v_member_id, 'member') ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
  RETURN v_thread_id;
END; $$;

-- Update RLS
DROP POLICY IF EXISTS "Thread admins can manage membership" ON public.chat_thread_members;
CREATE POLICY "Thread owners/moderators can manage membership" ON public.chat_thread_members FOR ALL
  USING (EXISTS (SELECT 1 FROM chat_thread_members m WHERE m.thread_id = chat_thread_members.thread_id AND m.user_id = get_user_id(auth.uid()) AND m.role IN ('owner', 'moderator') AND m.left_at IS NULL));

-- Unique constraint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_thread_members_thread_user_unique') THEN
    ALTER TABLE public.chat_thread_members ADD CONSTRAINT chat_thread_members_thread_user_unique UNIQUE (thread_id, user_id);
  END IF;
END $$;
