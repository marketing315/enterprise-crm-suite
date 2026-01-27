-- Add 'processing' status to allowed values for race-safe idempotency
ALTER TABLE public.sheets_export_logs 
DROP CONSTRAINT sheets_export_logs_status_check;

ALTER TABLE public.sheets_export_logs 
ADD CONSTRAINT sheets_export_logs_status_check 
CHECK (status IN ('pending', 'processing', 'success', 'failed', 'skipped'));