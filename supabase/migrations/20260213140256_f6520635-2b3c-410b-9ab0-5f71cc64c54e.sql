
-- Table for logging report executions
CREATE TABLE public.sync_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id UUID NOT NULL REFERENCES public.brands(id),
  mode TEXT NOT NULL, -- 'weekly_report', 'monthly_report', 'custom_report'
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'success', 'failed'
  period_from DATE NOT NULL,
  period_to DATE NOT NULL,
  triggered_by UUID REFERENCES public.users(id), -- NULL for cron
  webhook_status_code INT,
  webhook_response TEXT,
  report_payload JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE public.sync_runs ENABLE ROW LEVEL SECURITY;

-- RLS: admins can read their brand's sync_runs
CREATE POLICY "Admins can view sync_runs for their brands"
ON public.sync_runs FOR SELECT TO authenticated
USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

-- RLS: admins can insert sync_runs for their brands
CREATE POLICY "Admins can insert sync_runs for their brands"
ON public.sync_runs FOR INSERT TO authenticated
WITH CHECK (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

-- Index for querying by brand and mode
CREATE INDEX idx_sync_runs_brand_mode ON public.sync_runs(brand_id, mode, created_at DESC);

-- Rate limiting function for manual reports (max 20/hour per user)
CREATE OR REPLACE FUNCTION public.check_report_rate_limit(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*) < 20
  FROM sync_runs
  WHERE triggered_by = p_user_id
    AND created_at > now() - interval '1 hour';
$$;
