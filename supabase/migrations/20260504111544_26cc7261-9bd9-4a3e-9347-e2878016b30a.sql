
-- Add retry/DLQ columns to sheets_export_logs (additive, all nullable with safe defaults)
ALTER TABLE public.sheets_export_logs
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS last_error text NULL,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS dead_letter boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payload jsonb NULL;

-- Allow new "dead_letter" status without breaking existing check
ALTER TABLE public.sheets_export_logs
  DROP CONSTRAINT IF EXISTS sheets_export_logs_status_check;

ALTER TABLE public.sheets_export_logs
  ADD CONSTRAINT sheets_export_logs_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'success'::text, 'failed'::text, 'skipped'::text, 'dead_letter'::text]));

-- Index to claim due jobs efficiently
CREATE INDEX IF NOT EXISTS idx_sheets_export_logs_due
  ON public.sheets_export_logs (next_attempt_at)
  WHERE status IN ('pending', 'failed') AND dead_letter = false;

-- Backfill: any existing 'failed' rows become eligible for the dispatcher
UPDATE public.sheets_export_logs
SET next_attempt_at = COALESCE(next_attempt_at, now())
WHERE status IN ('pending', 'failed') AND next_attempt_at IS NULL AND dead_letter = false;
