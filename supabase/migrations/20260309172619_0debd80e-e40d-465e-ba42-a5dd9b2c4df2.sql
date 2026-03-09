-- Allow thread members to UPDATE their threads (for archiving)
CREATE POLICY "Thread members can update threads"
ON public.chat_threads
FOR UPDATE
TO authenticated
USING (
  is_thread_member(get_user_id(auth.uid()), id)
  OR has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role)
  OR has_role(get_user_id(auth.uid()), 'ceo'::app_role)
)
WITH CHECK (
  is_thread_member(get_user_id(auth.uid()), id)
  OR has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role)
  OR has_role(get_user_id(auth.uid()), 'ceo'::app_role)
);

-- Allow thread members to DELETE their threads
CREATE POLICY "Thread members can delete threads"
ON public.chat_threads
FOR DELETE
TO authenticated
USING (
  is_thread_member(get_user_id(auth.uid()), id)
  OR has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role)
  OR has_role(get_user_id(auth.uid()), 'ceo'::app_role)
);

-- Allow DELETE on chat_messages for thread cleanup
CREATE POLICY "Thread members can delete messages"
ON public.chat_messages
FOR DELETE
TO authenticated
USING (
  is_thread_member(get_user_id(auth.uid()), thread_id)
  OR has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role)
  OR has_role(get_user_id(auth.uid()), 'ceo'::app_role)
);