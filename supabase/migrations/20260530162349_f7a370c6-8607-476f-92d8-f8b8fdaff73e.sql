-- Chat push notifications: trigger that creates a notifications row
-- for each active thread member (excluding the sender) on new chat message.
-- The existing trg_notifications_dispatch_push trigger will fan-out web push.

CREATE OR REPLACE FUNCTION public.trg_chat_message_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_thread RECORD;
  v_sender_name TEXT;
  v_title TEXT;
  v_body TEXT;
BEGIN
  -- Only notify for real user messages (skip AI/system/internal)
  IF NEW.sender_type::text <> 'user' OR NEW.sender_user_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT t.id, t.title, t.type::text AS ttype, t.entity_type, t.entity_id, t.archived_at
    INTO v_thread
  FROM public.chat_threads t
  WHERE t.id = NEW.thread_id;

  IF v_thread.id IS NULL OR v_thread.archived_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(u.full_name, u.email, 'Qualcuno')
    INTO v_sender_name
  FROM public.users u
  WHERE u.id = NEW.sender_user_id;

  v_title := COALESCE(v_thread.title, v_sender_name);
  -- For 1:1 / entity threads, prefer the sender as title prefix
  IF v_thread.ttype <> 'group' THEN
    v_title := v_sender_name;
  ELSE
    v_title := COALESCE(v_thread.title, 'Gruppo') || ' · ' || v_sender_name;
  END IF;

  v_body := LEFT(REGEXP_REPLACE(COALESCE(NEW.message_text, ''), E'[\\n\\r\\t]+', ' ', 'g'), 140);

  INSERT INTO public.notifications (brand_id, user_id, type, title, body, entity_type, entity_id)
  SELECT
    NEW.brand_id,
    m.user_id,
    'chat_message'::notification_type,
    v_title,
    v_body,
    'chat_thread',
    NEW.thread_id
  FROM public.chat_thread_members m
  WHERE m.thread_id = NEW.thread_id
    AND m.left_at IS NULL
    AND m.user_id <> NEW.sender_user_id;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block the message insert
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chat_messages_notify ON public.chat_messages;
CREATE TRIGGER chat_messages_notify
AFTER INSERT ON public.chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.trg_chat_message_notify();