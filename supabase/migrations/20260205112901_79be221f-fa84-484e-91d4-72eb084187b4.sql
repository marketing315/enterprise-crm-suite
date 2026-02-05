-- 1. Add esito_chiamata field to contacts
ALTER TABLE public.contacts 
ADD COLUMN IF NOT EXISTS esito_chiamata text;

-- 2. Create automation_jobs table for scheduled outbound jobs
CREATE TABLE IF NOT EXISTS public.automation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  source_event_id uuid REFERENCES public.webhook_inbound_events(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  job_type text NOT NULL DEFAULT 'keplero.callback',
  run_at timestamptz NOT NULL,
  endpoint text NOT NULL,
  method text NOT NULL DEFAULT 'POST',
  headers jsonb NOT NULL DEFAULT '{}',
  payload jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'running', 'sent', 'failed', 'canceled')),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Indexes for dispatcher efficiency
CREATE INDEX IF NOT EXISTS idx_automation_jobs_dispatch 
ON public.automation_jobs (status, run_at) 
WHERE status = 'scheduled';

CREATE INDEX IF NOT EXISTS idx_automation_jobs_brand_run_at 
ON public.automation_jobs (brand_id, run_at);

CREATE INDEX IF NOT EXISTS idx_automation_jobs_contact 
ON public.automation_jobs (contact_id) 
WHERE contact_id IS NOT NULL;

-- 4. Enable RLS
ALTER TABLE public.automation_jobs ENABLE ROW LEVEL SECURITY;

-- 5. RLS policies
CREATE POLICY "Users can view automation jobs for their brands"
ON public.automation_jobs FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = (SELECT id FROM public.users WHERE supabase_auth_id = auth.uid())
    AND ur.brand_id = automation_jobs.brand_id
  )
);

CREATE POLICY "Admins can manage automation jobs"
ON public.automation_jobs FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = (SELECT id FROM public.users WHERE supabase_auth_id = auth.uid())
    AND ur.brand_id = automation_jobs.brand_id
    AND ur.role IN ('admin', 'ceo')
  )
);

-- 6. Service role bypass for edge functions
CREATE POLICY "Service role full access to automation_jobs"
ON public.automation_jobs FOR ALL
USING (auth.role() = 'service_role');

-- 7. Trigger for updated_at
CREATE TRIGGER update_automation_jobs_updated_at
BEFORE UPDATE ON public.automation_jobs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 8. Enable realtime for job status updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.automation_jobs;

-- 9. Add 'schedule_job' to action_type constraint
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
  'multi_action',
  'schedule_job',
  'update_contact_field'
));