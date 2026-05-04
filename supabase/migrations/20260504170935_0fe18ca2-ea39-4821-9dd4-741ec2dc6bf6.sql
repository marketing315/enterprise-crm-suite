
-- ============================================================
-- user_ui_preferences
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_ui_preferences (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  theme text,
  density text NOT NULL DEFAULT 'comfortable',
  language text NOT NULL DEFAULT 'it',
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_ui_preferences_density_chk CHECK (density IN ('comfortable','compact')),
  CONSTRAINT user_ui_preferences_theme_chk CHECK (theme IS NULL OR theme IN ('light','dark','system')),
  CONSTRAINT user_ui_preferences_language_chk CHECK (language IN ('it','en'))
);

ALTER TABLE public.user_ui_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ui_prefs_self_select" ON public.user_ui_preferences;
CREATE POLICY "ui_prefs_self_select" ON public.user_ui_preferences
  FOR SELECT USING (user_id = public.get_user_id(auth.uid()));

DROP POLICY IF EXISTS "ui_prefs_self_insert" ON public.user_ui_preferences;
CREATE POLICY "ui_prefs_self_insert" ON public.user_ui_preferences
  FOR INSERT WITH CHECK (user_id = public.get_user_id(auth.uid()));

DROP POLICY IF EXISTS "ui_prefs_self_update" ON public.user_ui_preferences;
CREATE POLICY "ui_prefs_self_update" ON public.user_ui_preferences
  FOR UPDATE USING (user_id = public.get_user_id(auth.uid()))
  WITH CHECK (user_id = public.get_user_id(auth.uid()));

CREATE OR REPLACE FUNCTION public.tg_user_ui_preferences_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_ui_preferences_set_updated_at ON public.user_ui_preferences;
CREATE TRIGGER user_ui_preferences_set_updated_at
  BEFORE UPDATE ON public.user_ui_preferences
  FOR EACH ROW EXECUTE FUNCTION public.tg_user_ui_preferences_set_updated_at();

-- ============================================================
-- deal_table_views (mirror of contact_table_views schema)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.deal_table_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  brand_scope text NOT NULL DEFAULT 'all_accessible',
  brand_id uuid,
  name text NOT NULL,
  columns jsonb NOT NULL DEFAULT '[]'::jsonb,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deal_table_views_brand_scope_chk CHECK (brand_scope IN ('single_brand','all_accessible'))
);

CREATE INDEX IF NOT EXISTS idx_deal_table_views_owner ON public.deal_table_views(owner_user_id);

ALTER TABLE public.deal_table_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deal_views_self_select" ON public.deal_table_views;
CREATE POLICY "deal_views_self_select" ON public.deal_table_views
  FOR SELECT USING (owner_user_id = public.get_user_id(auth.uid()));

DROP POLICY IF EXISTS "deal_views_self_insert" ON public.deal_table_views;
CREATE POLICY "deal_views_self_insert" ON public.deal_table_views
  FOR INSERT WITH CHECK (owner_user_id = public.get_user_id(auth.uid()));

DROP POLICY IF EXISTS "deal_views_self_update" ON public.deal_table_views;
CREATE POLICY "deal_views_self_update" ON public.deal_table_views
  FOR UPDATE USING (owner_user_id = public.get_user_id(auth.uid()))
  WITH CHECK (owner_user_id = public.get_user_id(auth.uid()));

DROP POLICY IF EXISTS "deal_views_self_delete" ON public.deal_table_views;
CREATE POLICY "deal_views_self_delete" ON public.deal_table_views
  FOR DELETE USING (owner_user_id = public.get_user_id(auth.uid()));

DROP TRIGGER IF EXISTS deal_table_views_set_updated_at ON public.deal_table_views;
CREATE TRIGGER deal_table_views_set_updated_at
  BEFORE UPDATE ON public.deal_table_views
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- ticket_table_views (mirror)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ticket_table_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  brand_scope text NOT NULL DEFAULT 'all_accessible',
  brand_id uuid,
  name text NOT NULL,
  columns jsonb NOT NULL DEFAULT '[]'::jsonb,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ticket_table_views_brand_scope_chk CHECK (brand_scope IN ('single_brand','all_accessible'))
);

CREATE INDEX IF NOT EXISTS idx_ticket_table_views_owner ON public.ticket_table_views(owner_user_id);

ALTER TABLE public.ticket_table_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ticket_views_self_select" ON public.ticket_table_views;
CREATE POLICY "ticket_views_self_select" ON public.ticket_table_views
  FOR SELECT USING (owner_user_id = public.get_user_id(auth.uid()));

DROP POLICY IF EXISTS "ticket_views_self_insert" ON public.ticket_table_views;
CREATE POLICY "ticket_views_self_insert" ON public.ticket_table_views
  FOR INSERT WITH CHECK (owner_user_id = public.get_user_id(auth.uid()));

DROP POLICY IF EXISTS "ticket_views_self_update" ON public.ticket_table_views;
CREATE POLICY "ticket_views_self_update" ON public.ticket_table_views
  FOR UPDATE USING (owner_user_id = public.get_user_id(auth.uid()))
  WITH CHECK (owner_user_id = public.get_user_id(auth.uid()));

DROP POLICY IF EXISTS "ticket_views_self_delete" ON public.ticket_table_views;
CREATE POLICY "ticket_views_self_delete" ON public.ticket_table_views
  FOR DELETE USING (owner_user_id = public.get_user_id(auth.uid()));

DROP TRIGGER IF EXISTS ticket_table_views_set_updated_at ON public.ticket_table_views;
CREATE TRIGGER ticket_table_views_set_updated_at
  BEFORE UPDATE ON public.ticket_table_views
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
