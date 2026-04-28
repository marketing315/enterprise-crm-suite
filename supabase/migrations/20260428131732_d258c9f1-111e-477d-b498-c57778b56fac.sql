ALTER TABLE public.incoming_requests
ADD COLUMN IF NOT EXISTS correlation_id text;

CREATE INDEX IF NOT EXISTS idx_incoming_requests_correlation_id
ON public.incoming_requests (correlation_id)
WHERE correlation_id IS NOT NULL;

COMMENT ON COLUMN public.incoming_requests.correlation_id IS
'End-to-end trace identifier propagated to edge logs, audit events and DLQ entries for a single webhook ingestion.';