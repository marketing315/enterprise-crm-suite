-- =============================================================
-- SECURITY HARDENING P0 — Audit RLS permissive policies
-- =============================================================
-- Additive-safe: solo restrizioni di accesso, zero modifica dati.
-- DROP POLICY è necessario perché Postgres non permette ALTER POLICY
-- per cambiare ruoli o predicato. Ricreate immediatamente più strette.

-- ----- 1. MCP catalog: rimuovere SELECT public, lasciare solo admin -----
-- Le tabelle mcp_resources/servers/tools sono catalog amministrativo,
-- non devono essere leggibili da tutti gli authenticated.
DROP POLICY IF EXISTS "Authenticated read mcp_resources" ON public.mcp_resources;
DROP POLICY IF EXISTS "Authenticated read mcp_servers" ON public.mcp_servers;
DROP POLICY IF EXISTS "Authenticated read mcp_tools" ON public.mcp_tools;

-- (Le policy "Admins full access mcp_*" già esistenti coprono accesso admin)

-- ----- 2. Mutation policy "Service*" — ristrette a service_role -----
-- Erano TO public con USING/WITH CHECK true: tecnicamente eseguibili
-- da authenticated. Le scritture avvengono solo da edge function (service_role).

-- anomaly_baselines
DROP POLICY IF EXISTS "Service updates baselines" ON public.anomaly_baselines;
CREATE POLICY "Service updates baselines" ON public.anomaly_baselines
  FOR UPDATE TO service_role USING (true);
DROP POLICY IF EXISTS "Service writes baselines" ON public.anomaly_baselines;
CREATE POLICY "Service writes baselines" ON public.anomaly_baselines
  FOR INSERT TO service_role WITH CHECK (true);

-- anomaly_detections
DROP POLICY IF EXISTS "Service inserts detections" ON public.anomaly_detections;
CREATE POLICY "Service inserts detections" ON public.anomaly_detections
  FOR INSERT TO service_role WITH CHECK (true);

-- audit_alert_deliveries
DROP POLICY IF EXISTS "Service can insert deliveries" ON public.audit_alert_deliveries;
CREATE POLICY "Service can insert deliveries" ON public.audit_alert_deliveries
  FOR INSERT TO service_role WITH CHECK (true);
DROP POLICY IF EXISTS "Service can update deliveries" ON public.audit_alert_deliveries;
CREATE POLICY "Service can update deliveries" ON public.audit_alert_deliveries
  FOR UPDATE TO service_role USING (true);

-- audit_anomalies
DROP POLICY IF EXISTS "Service can insert anomalies" ON public.audit_anomalies;
CREATE POLICY "Service can insert anomalies" ON public.audit_anomalies
  FOR INSERT TO service_role WITH CHECK (true);

-- capacity_snapshots
DROP POLICY IF EXISTS "Service writes capacity" ON public.capacity_snapshots;
CREATE POLICY "Service writes capacity" ON public.capacity_snapshots
  FOR INSERT TO service_role WITH CHECK (true);

-- compliance_change_log
DROP POLICY IF EXISTS "Service inserts compliance log" ON public.compliance_change_log;
CREATE POLICY "Service inserts compliance log" ON public.compliance_change_log
  FOR INSERT TO service_role WITH CHECK (true);

-- ----- 3. appointment_outcomes_insert_brand: stringere check -----
-- L'INSERT aveva with_check=true. Aggiungo verifica brand_id.
-- Mantengo il pattern già usato dalla SELECT policy esistente.
DROP POLICY IF EXISTS "appointment_outcomes_insert_brand" ON public.appointment_outcomes;
CREATE POLICY "appointment_outcomes_insert_brand" ON public.appointment_outcomes
  FOR INSERT TO authenticated
  WITH CHECK (
    brand_id = '00000000-0000-0000-0000-000000000000'::uuid
    OR EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE a.id = appointment_outcomes.appointment_id
        AND a.brand_id = appointment_outcomes.brand_id
    )
  );