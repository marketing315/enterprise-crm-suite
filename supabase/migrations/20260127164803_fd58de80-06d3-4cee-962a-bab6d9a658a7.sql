-- M9 Hardening: Race-safe idempotency constraint
-- Step 1: Delete duplicate rows, keeping only the most recent successful export per lead_event_id
DELETE FROM public.sheets_export_logs
WHERE id NOT IN (
  SELECT DISTINCT ON (lead_event_id) id
  FROM public.sheets_export_logs
  ORDER BY lead_event_id, 
    CASE WHEN status = 'success' THEN 0 ELSE 1 END,
    created_at DESC
);

-- Step 2: Add unique constraint on lead_event_id
ALTER TABLE public.sheets_export_logs 
ADD CONSTRAINT sheets_export_logs_lead_event_unique UNIQUE (lead_event_id);

-- Step 3: Add index on status for faster lookups during idempotency checks
CREATE INDEX IF NOT EXISTS idx_sheets_export_logs_status ON public.sheets_export_logs(status);