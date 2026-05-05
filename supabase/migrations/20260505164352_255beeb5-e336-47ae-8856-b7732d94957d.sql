-- H4: Soft-delete RLS hardening
-- Archived/deleted rows remain visible but become non-operational (no UPDATE/DELETE/child-INSERT)

-- ============ TICKETS ============
DROP POLICY IF EXISTS "Users can update tickets in their brands" ON public.tickets;
CREATE POLICY "Users can update tickets in their brands"
ON public.tickets
FOR UPDATE
USING (
  user_belongs_to_brand(get_user_id(auth.uid()), brand_id)
  AND (
    archived_at IS NULL
    OR has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role)
    OR has_role(get_user_id(auth.uid()), 'ceo'::app_role)
  )
);

DROP POLICY IF EXISTS "Users can delete tickets in their brands" ON public.tickets;
CREATE POLICY "Users can delete tickets in their brands"
ON public.tickets
FOR DELETE
USING (
  user_belongs_to_brand(get_user_id(auth.uid()), brand_id)
  AND (
    archived_at IS NULL
    OR has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role)
    OR has_role(get_user_id(auth.uid()), 'ceo'::app_role)
  )
);

-- ============ CHAT THREADS ============
DROP POLICY IF EXISTS "Thread members can update threads" ON public.chat_threads;
CREATE POLICY "Thread members can update threads"
ON public.chat_threads
FOR UPDATE
USING (
  (is_thread_member(get_user_id(auth.uid()), id)
    OR has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role)
    OR has_role(get_user_id(auth.uid()), 'ceo'::app_role))
  AND (
    archived_at IS NULL
    OR has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role)
    OR has_role(get_user_id(auth.uid()), 'ceo'::app_role)
  )
);

DROP POLICY IF EXISTS "Thread members can delete threads" ON public.chat_threads;
CREATE POLICY "Thread members can delete threads"
ON public.chat_threads
FOR DELETE
USING (
  (is_thread_member(get_user_id(auth.uid()), id)
    OR has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role)
    OR has_role(get_user_id(auth.uid()), 'ceo'::app_role))
  AND (
    archived_at IS NULL
    OR has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role)
    OR has_role(get_user_id(auth.uid()), 'ceo'::app_role))
);

-- ============ CHAT MESSAGES ============
-- Block INSERT into archived threads
DROP POLICY IF EXISTS "Thread members can send messages" ON public.chat_messages;
CREATE POLICY "Thread members can send messages"
ON public.chat_messages
FOR INSERT
WITH CHECK (
  (is_thread_member(get_user_id(auth.uid()), thread_id)
    OR has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role)
    OR has_role(get_user_id(auth.uid()), 'ceo'::app_role))
  AND NOT EXISTS (
    SELECT 1 FROM public.chat_threads t
    WHERE t.id = thread_id AND t.archived_at IS NOT NULL
  )
);

-- Block UPDATE on soft-deleted messages
DROP POLICY IF EXISTS "Users can edit their own messages" ON public.chat_messages;
CREATE POLICY "Users can edit their own messages"
ON public.chat_messages
FOR UPDATE
USING (
  sender_user_id = get_user_id(auth.uid())
  AND deleted_at IS NULL
);

-- Block DELETE on already soft-deleted messages (idempotent: nothing to delete twice)
DROP POLICY IF EXISTS "Thread members can delete messages" ON public.chat_messages;
CREATE POLICY "Thread members can delete messages"
ON public.chat_messages
FOR DELETE
USING (
  (is_thread_member(get_user_id(auth.uid()), thread_id)
    OR has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role)
    OR has_role(get_user_id(auth.uid()), 'ceo'::app_role))
  AND (
    deleted_at IS NULL
    OR has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role)
    OR has_role(get_user_id(auth.uid()), 'ceo'::app_role))
);