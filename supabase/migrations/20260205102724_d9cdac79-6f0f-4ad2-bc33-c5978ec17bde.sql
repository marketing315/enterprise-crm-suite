-- Add cron_expression column to automation_rules
ALTER TABLE public.automation_rules 
ADD COLUMN IF NOT EXISTS cron_expression text;

-- Add index for cron-based rules
CREATE INDEX IF NOT EXISTS idx_automation_rules_cron 
ON public.automation_rules (trigger_type, is_active) 
WHERE trigger_type = 'cron';

-- Add comment for documentation
COMMENT ON COLUMN public.automation_rules.cron_expression IS 'Cron expression for scheduled triggers (e.g., "0 9 * * *" for daily at 9am)';