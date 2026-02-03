-- Add rows_exported column to sheets_export_logs table
ALTER TABLE public.sheets_export_logs 
ADD COLUMN IF NOT EXISTS rows_exported integer DEFAULT 0;