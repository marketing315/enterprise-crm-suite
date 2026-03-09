-- Allow authenticated users to delete their own message reads
CREATE POLICY "Users can delete their message reads"
ON public.chat_message_reads
FOR DELETE
TO authenticated
USING (user_id = get_user_id(auth.uid()));

-- Allow thread members to delete ai_chat_runs for their threads
CREATE POLICY "Thread members can delete ai_chat_runs"
ON public.ai_chat_runs
FOR DELETE
TO authenticated
USING (
  is_thread_member(get_user_id(auth.uid()), thread_id)
  OR has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role)
  OR has_role(get_user_id(auth.uid()), 'ceo'::app_role)
);