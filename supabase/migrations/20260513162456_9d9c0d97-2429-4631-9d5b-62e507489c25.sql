
ALTER TABLE public.meta_apps
  ADD COLUMN IF NOT EXISTS token_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS token_last_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS token_scopes text[],
  ADD COLUMN IF NOT EXISTS token_last_error text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meta_apps_token_status_chk') THEN
    ALTER TABLE public.meta_apps
      ADD CONSTRAINT meta_apps_token_status_chk
      CHECK (token_status IN ('unknown','valid','invalid','expiring_soon','revoked'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_meta_apps_token_status ON public.meta_apps(token_status) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS public.meta_token_health_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_at timestamptz NOT NULL DEFAULT now(),
  meta_app_id uuid REFERENCES public.meta_apps(id) ON DELETE CASCADE,
  brand_id uuid,
  page_id text,
  status text NOT NULL,
  expires_at timestamptz,
  scopes text[],
  is_valid boolean,
  error_code int,
  error_message text,
  raw_response jsonb,
  incident_created boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meta_token_health_runs_app ON public.meta_token_health_runs(meta_app_id, run_at DESC);
CREATE INDEX IF NOT EXISTS idx_meta_token_health_runs_brand ON public.meta_token_health_runs(brand_id, run_at DESC);
CREATE INDEX IF NOT EXISTS idx_meta_token_health_runs_status ON public.meta_token_health_runs(status, run_at DESC);

ALTER TABLE public.meta_token_health_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin/CEO can view meta_token_health_runs" ON public.meta_token_health_runs;
CREATE POLICY "Admin/CEO can view meta_token_health_runs"
  ON public.meta_token_health_runs
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(public.get_user_id(auth.uid()), 'ceo'::app_role)
    OR (
      brand_id IS NOT NULL
      AND public.assert_brand_membership(public.get_user_id(auth.uid()), brand_id)
      AND public.has_role(public.get_user_id(auth.uid()), 'admin'::app_role)
    )
  );

DROP POLICY IF EXISTS "Block direct inserts on meta_token_health_runs" ON public.meta_token_health_runs;
CREATE POLICY "Block direct inserts on meta_token_health_runs"
  ON public.meta_token_health_runs FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "Block updates on meta_token_health_runs" ON public.meta_token_health_runs;
CREATE POLICY "Block updates on meta_token_health_runs"
  ON public.meta_token_health_runs FOR UPDATE TO authenticated USING (false);

DROP POLICY IF EXISTS "Block deletes on meta_token_health_runs" ON public.meta_token_health_runs;
CREATE POLICY "Block deletes on meta_token_health_runs"
  ON public.meta_token_health_runs FOR DELETE TO authenticated USING (false);
