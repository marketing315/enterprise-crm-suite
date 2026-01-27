-- M9: Create sheets_export_logs table for tracking Google Sheets exports
CREATE TABLE public.sheets_export_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id UUID NOT NULL REFERENCES public.brands(id),
  lead_event_id UUID NOT NULL REFERENCES public.lead_events(id),
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  tab_name TEXT,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes for efficient querying
CREATE INDEX idx_sheets_export_logs_brand_created ON public.sheets_export_logs(brand_id, created_at DESC);
CREATE INDEX idx_sheets_export_logs_lead_event ON public.sheets_export_logs(lead_event_id);

-- Enable RLS
ALTER TABLE public.sheets_export_logs ENABLE ROW LEVEL SECURITY;

-- Admins can view export logs for their brands
CREATE POLICY "Admins can view sheets export logs"
  ON public.sheets_export_logs
  FOR SELECT
  USING (has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role));