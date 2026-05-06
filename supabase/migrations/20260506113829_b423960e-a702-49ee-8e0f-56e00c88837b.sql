
-- ============================================================================
-- Sheet Export Health Guard: trigger registry + reconciliation log + RPCs
-- ============================================================================

-- 1) Critical triggers registry & check log -----------------------------------
CREATE TABLE IF NOT EXISTS public.critical_triggers_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_name text NOT NULL,
  table_name text NOT NULL,
  function_name text NOT NULL,
  description text,
  auto_recreate_sql text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trigger_name, table_name)
);

ALTER TABLE public.critical_triggers_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read critical triggers registry"
  ON public.critical_triggers_registry FOR SELECT
  USING (has_role(get_user_id(auth.uid()), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.critical_triggers_check_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checked_at timestamptz NOT NULL DEFAULT now(),
  trigger_name text NOT NULL,
  table_name text NOT NULL,
  present boolean NOT NULL,
  auto_recreated boolean NOT NULL DEFAULT false,
  recreate_error text,
  details jsonb
);
CREATE INDEX IF NOT EXISTS idx_critical_triggers_log_checked ON public.critical_triggers_check_log (checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_critical_triggers_log_missing ON public.critical_triggers_check_log (checked_at DESC) WHERE present = false;

ALTER TABLE public.critical_triggers_check_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read critical triggers log"
  ON public.critical_triggers_check_log FOR SELECT
  USING (has_role(get_user_id(auth.uid()), 'admin'::app_role));

-- 2) Sheets reconciliation log ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sheets_reconciliation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at timestamptz NOT NULL DEFAULT now(),
  brand_id uuid,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  db_count integer NOT NULL DEFAULT 0,
  sheet_count integer NOT NULL DEFAULT 0,
  delta integer NOT NULL DEFAULT 0,
  delta_pct numeric(6,2) NOT NULL DEFAULT 0,
  status text NOT NULL CHECK (status IN ('ok','drift','critical','error')),
  missing_lead_event_ids uuid[] DEFAULT '{}',
  details jsonb,
  backfill_enqueued integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sheets_recon_run_at ON public.sheets_reconciliation_log (run_at DESC);

ALTER TABLE public.sheets_reconciliation_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read sheets reconciliation log"
  ON public.sheets_reconciliation_log FOR SELECT
  USING (has_role(get_user_id(auth.uid()), 'admin'::app_role));

-- 3) Sheets export drift snapshot (for SLO monitor) --------------------------
CREATE TABLE IF NOT EXISTS public.sheets_export_drift_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checked_at timestamptz NOT NULL DEFAULT now(),
  window_minutes integer NOT NULL,
  lead_events_count integer NOT NULL,
  exports_success_count integer NOT NULL,
  exports_pending_count integer NOT NULL,
  exports_failed_count integer NOT NULL,
  success_ratio numeric(5,2) NOT NULL,
  status text NOT NULL CHECK (status IN ('ok','warn','critical')),
  incident_fired boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_drift_log_checked ON public.sheets_export_drift_log (checked_at DESC);

ALTER TABLE public.sheets_export_drift_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read sheets drift log"
  ON public.sheets_export_drift_log FOR SELECT
  USING (has_role(get_user_id(auth.uid()), 'admin'::app_role));

-- 4) RPC: verify_critical_triggers --------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_critical_triggers()
RETURNS TABLE (trigger_name text, table_name text, present boolean, auto_recreated boolean, error text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
  v_present boolean;
  v_recreated boolean;
  v_error text;
BEGIN
  FOR rec IN
    SELECT r.trigger_name, r.table_name, r.auto_recreate_sql
    FROM public.critical_triggers_registry r
    WHERE r.is_active = true
  LOOP
    v_present := EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE t.tgname = rec.trigger_name
        AND c.relname = rec.table_name
        AND n.nspname = 'public'
        AND NOT t.tgisinternal
    );
    v_recreated := false;
    v_error := NULL;

    IF NOT v_present AND rec.auto_recreate_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.auto_recreate_sql;
        v_recreated := true;
        v_present := true;
      EXCEPTION WHEN OTHERS THEN
        v_error := SQLERRM;
      END;
    END IF;

    INSERT INTO public.critical_triggers_check_log (trigger_name, table_name, present, auto_recreated, recreate_error)
    VALUES (rec.trigger_name, rec.table_name, v_present, v_recreated, v_error);

    trigger_name := rec.trigger_name;
    table_name := rec.table_name;
    present := v_present;
    auto_recreated := v_recreated;
    error := v_error;
    RETURN NEXT;
  END LOOP;
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_critical_triggers() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_critical_triggers() TO service_role;

-- 5) RPC: sheets_export_drift_snapshot ----------------------------------------
CREATE OR REPLACE FUNCTION public.sheets_export_drift_snapshot(p_window_minutes integer DEFAULT 60)
RETURNS TABLE (
  lead_events_count bigint,
  exports_success_count bigint,
  exports_pending_count bigint,
  exports_failed_count bigint,
  success_ratio numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_since timestamptz := now() - (p_window_minutes || ' minutes')::interval;
  v_leads bigint;
  v_succ  bigint;
  v_pend  bigint;
  v_fail  bigint;
BEGIN
  SELECT count(*) INTO v_leads FROM public.lead_events
   WHERE created_at >= v_since AND COALESCE(archived,false) = false;

  SELECT
    count(*) FILTER (WHERE status='success'),
    count(*) FILTER (WHERE status IN ('pending','processing')),
    count(*) FILTER (WHERE status IN ('failed','dead_letter'))
  INTO v_succ, v_pend, v_fail
  FROM public.sheets_export_logs
  WHERE created_at >= v_since;

  lead_events_count := v_leads;
  exports_success_count := v_succ;
  exports_pending_count := v_pend;
  exports_failed_count := v_fail;
  success_ratio := CASE WHEN v_leads = 0 THEN 100::numeric
                        ELSE round((v_succ::numeric / v_leads::numeric) * 100, 2) END;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.sheets_export_drift_snapshot(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sheets_export_drift_snapshot(integer) TO authenticated, service_role;

-- 6) RPC: enqueue_missing_sheets_exports (backfill helper) -------------------
CREATE OR REPLACE FUNCTION public.enqueue_missing_sheets_exports(
  p_since timestamptz,
  p_until timestamptz DEFAULT now(),
  p_limit integer DEFAULT 1000
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted integer;
BEGIN
  WITH missing AS (
    SELECT le.id, le.brand_id
    FROM public.lead_events le
    LEFT JOIN public.sheets_export_logs sel ON sel.lead_event_id = le.id
    WHERE le.created_at >= p_since
      AND le.created_at <= p_until
      AND COALESCE(le.archived,false) = false
      AND sel.id IS NULL
    ORDER BY le.created_at
    LIMIT GREATEST(p_limit, 1)
  ), ins AS (
    INSERT INTO public.sheets_export_logs (lead_event_id, brand_id, status, next_attempt_at, attempts)
    SELECT id, brand_id, 'pending', now(), 0 FROM missing
    ON CONFLICT (lead_event_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted FROM ins;
  RETURN COALESCE(v_inserted, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_missing_sheets_exports(timestamptz, timestamptz, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_missing_sheets_exports(timestamptz, timestamptz, integer) TO service_role;

-- 7) Seed registry with the trigger that disappeared in April -----------------
INSERT INTO public.critical_triggers_registry (trigger_name, table_name, function_name, description, auto_recreate_sql)
VALUES (
  'trg_enqueue_sheets_export_for_lead',
  'lead_events',
  'enqueue_sheets_export_for_lead',
  'Enqueues every new lead_event to sheets_export_logs (drives Google Sheet export)',
  $sql$CREATE TRIGGER trg_enqueue_sheets_export_for_lead AFTER INSERT ON public.lead_events FOR EACH ROW EXECUTE FUNCTION public.enqueue_sheets_export_for_lead();$sql$
)
ON CONFLICT (trigger_name, table_name) DO UPDATE
  SET auto_recreate_sql = EXCLUDED.auto_recreate_sql,
      description = EXCLUDED.description,
      function_name = EXCLUDED.function_name,
      is_active = true;

-- 8) Seed SLO definition for sheets export ------------------------------------
INSERT INTO public.slo_definitions (name, description, service_name, metric_type, target_percentage, window_days, threshold_value, is_active)
VALUES (
  'sheets-export-success-rate',
  'Ratio of lead_events that produce a successful sheets_export_logs row',
  'sheets-export',
  'availability',
  98.00,
  7,
  NULL,
  true
)
ON CONFLICT (name) DO NOTHING;
