
CREATE TABLE IF NOT EXISTS public.brand_perf_sheet_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL UNIQUE REFERENCES public.brands(id) ON DELETE CASCADE,
  spreadsheet_id text NOT NULL,
  spreadsheet_url text NOT NULL,
  tab_name text NOT NULL DEFAULT 'Performance',
  period_mode text NOT NULL DEFAULT 'current_month'
    CHECK (period_mode IN ('current_month','previous_month','last_30d','ytd')),
  cron_enabled boolean NOT NULL DEFAULT true,
  last_export_at timestamptz,
  last_status text,
  last_error text,
  last_rows_exported int,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_perf_sheet_cfg_enabled
  ON public.brand_perf_sheet_config(cron_enabled) WHERE cron_enabled = true;

ALTER TABLE public.brand_perf_sheet_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "perf_sheet_cfg_select"
  ON public.brand_perf_sheet_config FOR SELECT TO authenticated
  USING (
    public.has_role(public.get_user_id(auth.uid()), 'admin'::app_role)
    OR public.has_role(public.get_user_id(auth.uid()), 'ceo'::app_role)
    OR public.current_brand_role(brand_id) IN ('admin'::app_role, 'responsabile_venditori'::app_role)
  );

CREATE POLICY "perf_sheet_cfg_modify"
  ON public.brand_perf_sheet_config FOR ALL TO authenticated
  USING (
    public.has_role(public.get_user_id(auth.uid()), 'admin'::app_role)
    OR public.current_brand_role(brand_id) = 'admin'::app_role
  )
  WITH CHECK (
    public.has_role(public.get_user_id(auth.uid()), 'admin'::app_role)
    OR public.current_brand_role(brand_id) = 'admin'::app_role
  );

CREATE TRIGGER trg_perf_sheet_cfg_updated_at
  BEFORE UPDATE ON public.brand_perf_sheet_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
