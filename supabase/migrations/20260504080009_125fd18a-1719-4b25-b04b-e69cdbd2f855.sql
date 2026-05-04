-- ============================================================
-- Web Push Notifications - Phase 1: Schema
-- ============================================================

-- 1. Push subscriptions table (one row per device/browser)
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  failure_count INT NOT NULL DEFAULT 0,
  last_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
  ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Owner can manage own subscriptions
CREATE POLICY "push_subs_select_own"
  ON public.push_subscriptions FOR SELECT
  TO authenticated
  USING (user_id = public.get_user_id(auth.uid()));

CREATE POLICY "push_subs_insert_own"
  ON public.push_subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = public.get_user_id(auth.uid()));

CREATE POLICY "push_subs_update_own"
  ON public.push_subscriptions FOR UPDATE
  TO authenticated
  USING (user_id = public.get_user_id(auth.uid()))
  WITH CHECK (user_id = public.get_user_id(auth.uid()));

CREATE POLICY "push_subs_delete_own"
  ON public.push_subscriptions FOR DELETE
  TO authenticated
  USING (user_id = public.get_user_id(auth.uid()));

-- Service role full access (for dispatcher to update failure_count/last_used_at)
CREATE POLICY "push_subs_service_all"
  ON public.push_subscriptions FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================
-- 2. Per-user push preferences (opt-out per notification_type)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_push_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  notification_type TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, notification_type)
);

CREATE INDEX IF NOT EXISTS idx_user_push_prefs_user
  ON public.user_push_preferences (user_id);

ALTER TABLE public.user_push_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_push_prefs_select_own"
  ON public.user_push_preferences FOR SELECT
  TO authenticated
  USING (user_id = public.get_user_id(auth.uid()));

CREATE POLICY "user_push_prefs_upsert_own"
  ON public.user_push_preferences FOR INSERT
  TO authenticated
  WITH CHECK (user_id = public.get_user_id(auth.uid()));

CREATE POLICY "user_push_prefs_update_own"
  ON public.user_push_preferences FOR UPDATE
  TO authenticated
  USING (user_id = public.get_user_id(auth.uid()))
  WITH CHECK (user_id = public.get_user_id(auth.uid()));

CREATE POLICY "user_push_prefs_delete_own"
  ON public.user_push_preferences FOR DELETE
  TO authenticated
  USING (user_id = public.get_user_id(auth.uid()));

CREATE POLICY "user_push_prefs_service_all"
  ON public.user_push_preferences FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================
-- 3. Trigger on notifications -> async dispatch via pg_net
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_notifications_dispatch_push()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url TEXT;
  v_anon TEXT;
BEGIN
  -- Best-effort async dispatch; never block the insert
  BEGIN
    v_url := 'https://qmqcjtmcxfqahhubpaea.supabase.co/functions/v1/web-push-dispatcher';
    v_anon := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtcWNqdG1jeGZxYWhodWJwYWVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxOTAxNjMsImV4cCI6MjA4NDc2NjE2M30.dEquxxLGm9VfT2_T8ty3dakAytK9ePoUjT5x7IKbK-o';

    PERFORM net.http_post(
      url := v_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', v_anon
      ),
      body := jsonb_build_object('notification_id', NEW.id)
    );
  EXCEPTION WHEN OTHERS THEN
    -- Swallow; in-app notification still works
    NULL;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notifications_dispatch_push ON public.notifications;
CREATE TRIGGER notifications_dispatch_push
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_notifications_dispatch_push();