
-- =====================================================================
-- H4 — Soft-delete filter on SELECT RLS policies
-- Atomic migration: drop+recreate SELECT policies on PII tables
-- =====================================================================

-- ---------- contacts ----------
DROP POLICY IF EXISTS "Users can view contacts in their brands" ON public.contacts;
CREATE POLICY "Users can view contacts in their brands"
  ON public.contacts FOR SELECT
  USING (
    user_belongs_to_brand(get_user_id(auth.uid()), brand_id)
    AND (
      merged_into_contact_id IS NULL
      OR has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role)
      OR has_role(get_user_id(auth.uid()), 'ceo'::app_role)
    )
  );

DROP POLICY IF EXISTS "Users can view contacts via brand hierarchy" ON public.contacts;
CREATE POLICY "Users can view contacts via brand hierarchy"
  ON public.contacts FOR SELECT
  USING (
    user_can_access_brand(auth.uid(), brand_id)
    AND (
      merged_into_contact_id IS NULL
      OR has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role)
      OR has_role(get_user_id(auth.uid()), 'ceo'::app_role)
    )
  );

-- ---------- lead_events ----------
DROP POLICY IF EXISTS "Users can view lead events in their brands" ON public.lead_events;
CREATE POLICY "Users can view lead events in their brands"
  ON public.lead_events FOR SELECT
  USING (
    user_belongs_to_brand(get_user_id(auth.uid()), brand_id)
    AND (
      archived = false
      OR has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role)
      OR has_role(get_user_id(auth.uid()), 'ceo'::app_role)
    )
  );

-- ---------- tickets ----------
DROP POLICY IF EXISTS "Users can view tickets in their brands" ON public.tickets;
CREATE POLICY "Users can view tickets in their brands"
  ON public.tickets FOR SELECT
  USING (
    user_belongs_to_brand(get_user_id(auth.uid()), brand_id)
    AND (
      (archived = false AND archived_at IS NULL)
      OR has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role)
      OR has_role(get_user_id(auth.uid()), 'ceo'::app_role)
    )
  );

-- ---------- chat_threads ----------
DROP POLICY IF EXISTS "Users can view threads they are members of" ON public.chat_threads;
CREATE POLICY "Users can view threads they are members of"
  ON public.chat_threads FOR SELECT
  USING (
    (
      is_thread_member(get_user_id(auth.uid()), id)
      OR has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role)
      OR has_role(get_user_id(auth.uid()), 'ceo'::app_role)
    )
    AND (
      archived_at IS NULL
      OR has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role)
      OR has_role(get_user_id(auth.uid()), 'ceo'::app_role)
    )
  );

-- ---------- chat_messages ----------
DROP POLICY IF EXISTS "Thread members can view messages" ON public.chat_messages;
CREATE POLICY "Thread members can view messages"
  ON public.chat_messages FOR SELECT
  USING (
    (
      is_thread_member(get_user_id(auth.uid()), thread_id)
      OR has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role)
      OR has_role(get_user_id(auth.uid()), 'ceo'::app_role)
    )
    AND (
      deleted_at IS NULL
      OR has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role)
      OR has_role(get_user_id(auth.uid()), 'ceo'::app_role)
    )
  );
