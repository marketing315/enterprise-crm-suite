-- Drop the recursive policy
DROP POLICY IF EXISTS "Thread owners/moderators can manage membership" ON public.chat_thread_members;

-- Create security definer function to avoid recursion
CREATE OR REPLACE FUNCTION public.is_thread_owner_or_moderator(_user_id uuid, _thread_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM chat_thread_members
    WHERE thread_id = _thread_id
    AND user_id = _user_id
    AND role IN ('owner', 'moderator')
    AND left_at IS NULL
  )
$$;

-- INSERT: thread creator or admin can add members
CREATE POLICY "Members can be added by thread creator or admin" ON public.chat_thread_members
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM chat_threads t
    WHERE t.id = chat_thread_members.thread_id
    AND (
      t.created_by = get_user_id(auth.uid())
      OR has_role_for_brand(get_user_id(auth.uid()), t.brand_id, 'admin'::app_role)
      OR has_role(get_user_id(auth.uid()), 'ceo'::app_role)
    )
  )
);

-- UPDATE: owners/moderators
CREATE POLICY "Thread owners/moderators can update membership" ON public.chat_thread_members
FOR UPDATE TO authenticated
USING (is_thread_owner_or_moderator(get_user_id(auth.uid()), thread_id));

-- DELETE: owners/moderators
CREATE POLICY "Thread owners/moderators can delete membership" ON public.chat_thread_members
FOR DELETE TO authenticated
USING (is_thread_owner_or_moderator(get_user_id(auth.uid()), thread_id));