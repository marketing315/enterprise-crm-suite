-- Anti-replay/dedup table for webhook ingest
CREATE TABLE IF NOT EXISTS public.webhook_request_dedup (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_id UUID NOT NULL REFERENCES public.webhook_sources(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT webhook_dedup_unique UNIQUE (source_id, fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_webhook_dedup_expires_at
  ON public.webhook_request_dedup(expires_at);

CREATE INDEX IF NOT EXISTS idx_webhook_dedup_source
  ON public.webhook_request_dedup(source_id, created_at DESC);

ALTER TABLE public.webhook_request_dedup ENABLE ROW LEVEL SECURITY;

-- Only service role (edge functions) can manage this table; no end-user access.
-- We intentionally do NOT create permissive policies for authenticated users.
-- The service role bypasses RLS so edge functions can read/write freely.

-- Cleanup helper: removes expired dedup entries
CREATE OR REPLACE FUNCTION public.cleanup_webhook_dedup()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.webhook_request_dedup
  WHERE expires_at < now();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

COMMENT ON TABLE public.webhook_request_dedup IS
  'Stores fingerprints of recently-processed webhook requests to detect duplicates within the replay window. Cleaned up periodically via cleanup_webhook_dedup().';
