
CREATE TABLE IF NOT EXISTS public.health_alert_state (
  alert_key text PRIMARY KEY,
  last_sent_at timestamptz NOT NULL DEFAULT now(),
  last_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  send_count integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.health_alert_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "health_alert_state_admin_select" ON public.health_alert_state
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'ceo'::app_role));

CREATE POLICY "health_alert_state_service" ON public.health_alert_state
  FOR ALL TO service_role USING (true) WITH CHECK (true);
