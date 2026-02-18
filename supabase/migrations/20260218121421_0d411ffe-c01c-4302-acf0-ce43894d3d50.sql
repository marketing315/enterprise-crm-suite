
-- Allow 'manual_custom' as a valid trigger_type in lead_digest_runs
-- First drop any existing check constraint on trigger_type
ALTER TABLE public.lead_digest_runs
  DROP CONSTRAINT IF EXISTS lead_digest_runs_trigger_type_check;

-- Re-add with the new allowed value
ALTER TABLE public.lead_digest_runs
  ADD CONSTRAINT lead_digest_runs_trigger_type_check
  CHECK (trigger_type IN ('scheduled', 'manual', 'retry', 'manual_custom'));
