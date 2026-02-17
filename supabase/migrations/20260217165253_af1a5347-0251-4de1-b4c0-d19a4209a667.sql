
-- 1) Module status enum
CREATE TYPE public.module_status AS ENUM ('active', 'maintain', 'evaluate', 'frozen', 'sunset');

-- 2) Feature flags table (per-brand module control)
CREATE TABLE public.feature_flags (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  module_key text NOT NULL,
  module_label text NOT NULL,
  status public.module_status NOT NULL DEFAULT 'active',
  frozen_message text DEFAULT 'Questo modulo è temporaneamente disattivato.',
  frozen_redirect text DEFAULT '/dashboard',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  UNIQUE(brand_id, module_key)
);

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read feature flags"
  ON public.feature_flags FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage feature flags"
  ON public.feature_flags FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.brand_id = feature_flags.brand_id
        AND ur.role = 'admin'
    )
  );

-- 3) Module usage telemetry
CREATE TABLE public.module_usage_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  module_key text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  event_type text NOT NULL DEFAULT 'page_view',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.module_usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can insert usage events"
  ON public.module_usage_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can read usage events"
  ON public.module_usage_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.brand_id = module_usage_events.brand_id
        AND ur.role IN ('admin', 'ceo')
    )
  );

CREATE INDEX idx_module_usage_brand_module ON public.module_usage_events(brand_id, module_key, created_at DESC);

-- 4) RPC: get module adoption stats
CREATE OR REPLACE FUNCTION public.get_module_adoption_stats(
  p_brand_id uuid,
  p_days integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  v_since timestamptz := now() - (p_days || ' days')::interval;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'module_key', module_key,
    'total_events', total_events,
    'unique_users', unique_users,
    'last_used', last_used,
    'avg_daily', ROUND(total_events::numeric / GREATEST(p_days, 1), 1)
  ) ORDER BY total_events DESC), '[]'::jsonb)
  INTO result
  FROM (
    SELECT
      module_key,
      COUNT(*) AS total_events,
      COUNT(DISTINCT user_id) AS unique_users,
      MAX(created_at) AS last_used
    FROM module_usage_events
    WHERE brand_id = p_brand_id
      AND created_at >= v_since
    GROUP BY module_key
  ) sub;

  RETURN result;
END;
$$;

-- 5) Seed default flags for all existing brands
INSERT INTO public.feature_flags (brand_id, module_key, module_label, status)
SELECT b.id, m.key, m.label, m.status::public.module_status
FROM public.brands b
CROSS JOIN (VALUES
  ('chat_team', 'Chat Team', 'frozen'),
  ('ad_stats_sync', 'Ad Stats Sync', 'frozen'),
  ('voispeed', 'VOIspeed', 'frozen'),
  ('keplero', 'Keplero', 'frozen'),
  ('pwa_install', 'PWA Install', 'frozen'),
  ('ai_chat', 'AI Chat', 'evaluate'),
  ('sheets_export', 'Google Sheets Export', 'evaluate'),
  ('analytics_advanced', 'Analytics Avanzati', 'evaluate'),
  ('ceo_dashboard', 'Dashboard CEO', 'evaluate'),
  ('company_finance', 'Azienda / Finance', 'evaluate'),
  ('forecast', 'Forecast', 'evaluate'),
  ('callcenter_kpi', 'Callcenter KPI', 'evaluate'),
  ('capi_monitor', 'CAPI Monitor', 'evaluate')
) AS m(key, label, status)
ON CONFLICT (brand_id, module_key) DO NOTHING;
