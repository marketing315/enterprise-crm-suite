-- Add 'multi_action' to allowed action_type values
ALTER TABLE public.automation_rules 
DROP CONSTRAINT IF EXISTS automation_rules_action_type_check;

ALTER TABLE public.automation_rules 
ADD CONSTRAINT automation_rules_action_type_check 
CHECK (action_type IN (
  'assign_user',
  'add_tag', 
  'create_ticket',
  'update_deal_stage',
  'send_notification',
  'upsert_contact',
  'create_deal',
  'set_callback_requested',
  'multi_action'
));