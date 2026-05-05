-- G2: system_settings table for DR flags (banner, queue-only mode)
CREATE TABLE IF NOT EXISTS public.system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Read: any authenticated user (banner needs to reach every UI)
DROP POLICY IF EXISTS "system_settings_read_authenticated" ON public.system_settings;
CREATE POLICY "system_settings_read_authenticated"
  ON public.system_settings FOR SELECT
  TO authenticated
  USING (true);

-- Write: admin only
DROP POLICY IF EXISTS "system_settings_write_admin" ON public.system_settings;
CREATE POLICY "system_settings_write_admin"
  ON public.system_settings FOR ALL
  TO authenticated
  USING (public.has_role(public.get_user_id(auth.uid()), 'admin'::app_role))
  WITH CHECK (public.has_role(public.get_user_id(auth.uid()), 'admin'::app_role));

-- Touch updated_at
CREATE OR REPLACE FUNCTION public.tg_system_settings_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  NEW.updated_by = COALESCE(public.get_user_id(auth.uid()), NEW.updated_by);
  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS trg_system_settings_touch ON public.system_settings;
CREATE TRIGGER trg_system_settings_touch
  BEFORE INSERT OR UPDATE ON public.system_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_system_settings_touch();

-- Seed default flags (disabled)
INSERT INTO public.system_settings (key, value) VALUES
  ('webhook_queue_only_mode', jsonb_build_object('enabled', false)),
  ('system_banner', jsonb_build_object('enabled', false))
ON CONFLICT (key) DO NOTHING;

-- Realtime: emit full row so the UI can react to banner changes
ALTER TABLE public.system_settings REPLICA IDENTITY FULL;
DO $$
BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.system_settings';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;