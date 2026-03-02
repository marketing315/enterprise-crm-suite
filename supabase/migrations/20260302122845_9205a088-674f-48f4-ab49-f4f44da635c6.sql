
CREATE TABLE public.ad_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  account_id TEXT NOT NULL,
  brand_id UUID REFERENCES brands(id),
  success BOOLEAN NOT NULL,
  campaigns_synced INT DEFAULT 0,
  sync_from DATE NOT NULL,
  sync_to DATE NOT NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.ad_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON public.ad_sync_log FOR ALL USING (false);
