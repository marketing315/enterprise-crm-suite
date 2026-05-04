-- Fix RBAC RLS audit: 12 policy usavano has_role(auth.uid(), ...) invece di
-- has_role(get_user_id(auth.uid()), ...). user_roles.user_id è l'ID interno
-- (public.users.id), NON auth.uid(). Il risultato attuale: queste tabelle sono
-- inaccessibili anche agli admin (le policy non matchano mai), ed è un design
-- frangibile: basterebbe un singolo utente con users.id = auth.uid() per
-- ottenere bypass. Riscriviamo tutte le policy con il pattern canonico.

-- ==== dependency_inventory ====
DROP POLICY IF EXISTS "Admins manage dependency inventory" ON public.dependency_inventory;
CREATE POLICY "Admins manage dependency inventory"
ON public.dependency_inventory
FOR ALL
TO authenticated
USING (has_role(get_user_id(auth.uid()), 'admin'::app_role))
WITH CHECK (has_role(get_user_id(auth.uid()), 'admin'::app_role));

-- ==== mcp_slo_alerts ====
DROP POLICY IF EXISTS "mcp_slo_alerts_admin_ack" ON public.mcp_slo_alerts;
CREATE POLICY "mcp_slo_alerts_admin_ack"
ON public.mcp_slo_alerts
FOR UPDATE
TO authenticated
USING (
  has_role(get_user_id(auth.uid()), 'admin'::app_role)
  OR has_role(get_user_id(auth.uid()), 'ceo'::app_role)
)
WITH CHECK (
  has_role(get_user_id(auth.uid()), 'admin'::app_role)
  OR has_role(get_user_id(auth.uid()), 'ceo'::app_role)
);

DROP POLICY IF EXISTS "mcp_slo_alerts_admin_read" ON public.mcp_slo_alerts;
CREATE POLICY "mcp_slo_alerts_admin_read"
ON public.mcp_slo_alerts
FOR SELECT
TO authenticated
USING (
  has_role(get_user_id(auth.uid()), 'admin'::app_role)
  OR has_role(get_user_id(auth.uid()), 'ceo'::app_role)
);

-- ==== notification_webhook_destinations ====
DROP POLICY IF EXISTS "Admins manage notification webhook destinations" ON public.notification_webhook_destinations;
CREATE POLICY "Admins manage notification webhook destinations"
ON public.notification_webhook_destinations
FOR ALL
TO authenticated
USING (has_role(get_user_id(auth.uid()), 'admin'::app_role))
WITH CHECK (has_role(get_user_id(auth.uid()), 'admin'::app_role));

-- ==== notification_webhook_outbox ====
DROP POLICY IF EXISTS "Admins read notification webhook outbox" ON public.notification_webhook_outbox;
CREATE POLICY "Admins read notification webhook outbox"
ON public.notification_webhook_outbox
FOR SELECT
TO authenticated
USING (has_role(get_user_id(auth.uid()), 'admin'::app_role));

-- ==== slo_definitions ====
DROP POLICY IF EXISTS "Admins manage SLO definitions" ON public.slo_definitions;
CREATE POLICY "Admins manage SLO definitions"
ON public.slo_definitions
FOR ALL
TO authenticated
USING (has_role(get_user_id(auth.uid()), 'admin'::app_role))
WITH CHECK (has_role(get_user_id(auth.uid()), 'admin'::app_role));

-- ==== slo_measurements ====
DROP POLICY IF EXISTS "Admins view SLO measurements" ON public.slo_measurements;
CREATE POLICY "Admins view SLO measurements"
ON public.slo_measurements
FOR SELECT
TO authenticated
USING (has_role(get_user_id(auth.uid()), 'admin'::app_role));

-- INSERT su slo_measurements: il commento dice "Service role" ma era TO authenticated.
-- Riallineiamo a service_role (lo scrive l'edge function slo-burn-rate-monitor).
DROP POLICY IF EXISTS "Service role inserts SLO measurements" ON public.slo_measurements;
CREATE POLICY "Service role inserts SLO measurements"
ON public.slo_measurements
FOR INSERT
TO service_role
WITH CHECK (true);

-- ==== ticket_escalation_policies ====
DROP POLICY IF EXISTS "ticket_escalation_policies_admin_all" ON public.ticket_escalation_policies;
CREATE POLICY "ticket_escalation_policies_admin_all"
ON public.ticket_escalation_policies
FOR ALL
TO authenticated
USING (
  has_role(get_user_id(auth.uid()), 'admin'::app_role)
  OR has_role(get_user_id(auth.uid()), 'ceo'::app_role)
)
WITH CHECK (
  has_role(get_user_id(auth.uid()), 'admin'::app_role)
  OR has_role(get_user_id(auth.uid()), 'ceo'::app_role)
);

DROP POLICY IF EXISTS "ticket_escalation_policies_select_authorized" ON public.ticket_escalation_policies;
CREATE POLICY "ticket_escalation_policies_select_authorized"
ON public.ticket_escalation_policies
FOR SELECT
TO authenticated
USING (
  has_role(get_user_id(auth.uid()), 'admin'::app_role)
  OR has_role(get_user_id(auth.uid()), 'ceo'::app_role)
  OR ((brand_id IS NOT NULL) AND user_belongs_to_brand(get_user_id(auth.uid()), brand_id))
  OR (brand_id IS NULL)
);

-- ==== trace_events ====
DROP POLICY IF EXISTS "Admins view trace events" ON public.trace_events;
CREATE POLICY "Admins view trace events"
ON public.trace_events
FOR SELECT
TO authenticated
USING (has_role(get_user_id(auth.uid()), 'admin'::app_role));

-- INSERT trace_events: era TO authenticated WITH CHECK has_role(auth.uid(), 'admin').
-- I trace_events sono scritti dalle edge function (mcp-server, gateway). Riallineiamo a service_role.
DROP POLICY IF EXISTS "Admins insert trace events" ON public.trace_events;
CREATE POLICY "Service inserts trace events"
ON public.trace_events
FOR INSERT
TO service_role
WITH CHECK (true);
