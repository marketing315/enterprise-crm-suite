-- Add inbound_webhook and cron trigger types
ALTER TABLE public.automation_rules 
DROP CONSTRAINT IF EXISTS automation_rules_trigger_type_check;

ALTER TABLE public.automation_rules 
ADD CONSTRAINT automation_rules_trigger_type_check 
CHECK (trigger_type IN (
  'deal_stale',
  'stage_enter',
  'stage_exit',
  'score_threshold',
  'time_based',
  'sla_warning',
  'appointment_reminder',
  'inbound_webhook',
  'cron'
));