
CREATE TABLE IF NOT EXISTS public.meta_leads_backfill_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES public.meta_apps(id) ON DELETE CASCADE,
  page_id text NOT NULL,
  form_id text,
  triggered_by uuid,
  trigger_kind text NOT NULL DEFAULT 'manual', -- manual | cron | api
  since_at timestamptz,
  until_at timestamptz,
  pages_fetched int NOT NULL DEFAULT 0,
  leads_seen int NOT NULL DEFAULT 0,
  leads_inserted int NOT NULL DEFAULT 0,
  leads_duplicate int NOT NULL DEFAULT 0,
  leads_recovered int NOT NULL DEFAULT 0,
  leads_failed int NOT NULL DEFAULT 0,
  forms jsonb,                 -- per-form counters [{form_id, name, seen, inserted, duplicate, error?}]
  status text NOT NULL DEFAULT 'running', -- running | completed | failed | partial
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mlbr_brand_started ON public.meta_leads_backfill_runs (brand_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_mlbr_source ON public.meta_leads_backfill_runs (source_id, started_at DESC);

ALTER TABLE public.meta_leads_backfill_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Brand admins/CEO can view backfill runs" ON public.meta_leads_backfill_runs;
CREATE POLICY "Brand admins/CEO can view backfill runs"
ON public.meta_leads_backfill_runs
FOR SELECT
USING (
  public.has_role_for_brand(public.get_user_id(auth.uid()), brand_id, 'admin'::public.app_role)
  OR public.has_role(public.get_user_id(auth.uid()), 'ceo'::public.app_role)
);
