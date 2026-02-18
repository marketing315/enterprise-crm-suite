
-- ============================================================
-- Lead Digest Call Center: Configuration + Audit tables
-- ============================================================

-- 1. Config table (global single-row, keyed by system brand)
CREATE TABLE IF NOT EXISTS public.lead_digest_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_enabled boolean NOT NULL DEFAULT false,
  timezone text NOT NULL DEFAULT 'Europe/Rome',
  schedule_times text[] NOT NULL DEFAULT ARRAY['12:00','16:30'],
  to_recipients text[] NOT NULL DEFAULT ARRAY[]::text[],
  cc_recipients text[] NULL,
  include_filtered_link boolean NOT NULL DEFAULT false,
  webhook_url_override text NULL,
  updated_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Insert default row if not exists
INSERT INTO public.lead_digest_config (id)
VALUES ('00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- Enable RLS
ALTER TABLE public.lead_digest_config ENABLE ROW LEVEL SECURITY;

-- Only admin/ceo can read config
CREATE POLICY "admin_ceo_select_lead_digest_config"
  ON public.lead_digest_config FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (
        SELECT u.id FROM public.users u
        WHERE u.supabase_auth_id = auth.uid() LIMIT 1
      )
      AND ur.role IN ('admin', 'ceo')
    )
  );

-- Only admin/ceo can update config
CREATE POLICY "admin_ceo_update_lead_digest_config"
  ON public.lead_digest_config FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (
        SELECT u.id FROM public.users u
        WHERE u.supabase_auth_id = auth.uid() LIMIT 1
      )
      AND ur.role IN ('admin', 'ceo')
    )
  );

-- 2. Audit / runs table
CREATE TABLE IF NOT EXISTS public.lead_digest_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_type text NOT NULL CHECK (trigger_type IN ('scheduled','manual','retry')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  lead_count_raw int NOT NULL DEFAULT 0,
  lead_count_unique int NOT NULL DEFAULT 0,
  dedupe_stats jsonb NULL,
  to_recipients text[] NOT NULL DEFAULT ARRAY[]::text[],
  cc_recipients text[] NULL,
  include_filtered_link boolean NOT NULL DEFAULT false,
  filtered_link text NULL,
  payload jsonb NULL,
  response_status int NULL,
  response_body text NULL,
  error_message text NULL,
  attempt_no int NOT NULL DEFAULT 1,
  retry_of_run_id uuid NULL REFERENCES public.lead_digest_runs(id) ON DELETE SET NULL,
  scheduled_for_retry_at timestamptz NULL,
  sent_at timestamptz NULL,
  created_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for performance
CREATE INDEX IF NOT EXISTS lead_digest_runs_status_idx ON public.lead_digest_runs(status);
CREATE INDEX IF NOT EXISTS lead_digest_runs_created_at_idx ON public.lead_digest_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS lead_digest_runs_scheduled_retry_idx ON public.lead_digest_runs(scheduled_for_retry_at) WHERE status = 'failed' AND scheduled_for_retry_at IS NOT NULL;

-- Enable RLS
ALTER TABLE public.lead_digest_runs ENABLE ROW LEVEL SECURITY;

-- admin/ceo can read runs
CREATE POLICY "admin_ceo_select_lead_digest_runs"
  ON public.lead_digest_runs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (
        SELECT u.id FROM public.users u
        WHERE u.supabase_auth_id = auth.uid() LIMIT 1
      )
      AND ur.role IN ('admin', 'ceo')
    )
  );

-- Service role has full access (edge functions)
CREATE POLICY "service_role_all_lead_digest_config"
  ON public.lead_digest_config FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_role_all_lead_digest_runs"
  ON public.lead_digest_runs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
