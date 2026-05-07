
-- Tracciamento upload archivi su Google Drive (additive, nullable)
ALTER TABLE public.backup_runs
  ADD COLUMN IF NOT EXISTS drive_file_id text,
  ADD COLUMN IF NOT EXISTS drive_uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS drive_web_view_link text,
  ADD COLUMN IF NOT EXISTS drive_error text;

CREATE INDEX IF NOT EXISTS idx_backup_runs_drive_file_id
  ON public.backup_runs (drive_file_id)
  WHERE drive_file_id IS NOT NULL;
