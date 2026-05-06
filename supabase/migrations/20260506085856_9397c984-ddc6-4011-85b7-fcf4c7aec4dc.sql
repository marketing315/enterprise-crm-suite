
-- ============================================================
-- A10 — Cron Isolation & Tenant Scoping (additive governance)
-- ============================================================

-- 1. Registry of declared cron jobs
CREATE TABLE IF NOT EXISTS public.cron_job_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text NOT NULL UNIQUE,
  tenant_scope text NOT NULL DEFAULT 'system'
    CHECK (tenant_scope IN ('system', 'brand', 'user')),
  brand_id uuid NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  description text NOT NULL,
  owner_role text NOT NULL DEFAULT 'platform',
  schedule_doc text NULL,
  expected_runtime_seconds integer NULL CHECK (expected_runtime_seconds IS NULL OR expected_runtime_seconds > 0),
  is_critical boolean NOT NULL DEFAULT false,
  -- Documenta se il job invoca SECURITY DEFINER functions o solo edge functions
  invokes_security_definer boolean NOT NULL DEFAULT false,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL,
  updated_by uuid NULL,
  CONSTRAINT cron_registry_brand_consistency CHECK (
    (tenant_scope = 'brand' AND brand_id IS NOT NULL) OR
    (tenant_scope <> 'brand' AND brand_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_cron_job_registry_brand ON public.cron_job_registry(brand_id) WHERE brand_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cron_job_registry_scope ON public.cron_job_registry(tenant_scope);

ALTER TABLE public.cron_job_registry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cron_registry_admin_select ON public.cron_job_registry;
CREATE POLICY cron_registry_admin_select ON public.cron_job_registry
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ceo'));

DROP POLICY IF EXISTS cron_registry_admin_write ON public.cron_job_registry;
CREATE POLICY cron_registry_admin_write ON public.cron_job_registry
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

REVOKE ALL ON public.cron_job_registry FROM anon, authenticated;
GRANT SELECT ON public.cron_job_registry TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.cron_job_registry TO authenticated;

-- 2. Run log (append-only, observability)
CREATE TABLE IF NOT EXISTS public.cron_run_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_name text NOT NULL,
  brand_id uuid NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz NULL,
  duration_ms integer NULL,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'success', 'error', 'skipped')),
  error_summary text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_cron_run_log_job_started ON public.cron_run_log(job_name, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_cron_run_log_status ON public.cron_run_log(status, started_at DESC) WHERE status IN ('error','running');

ALTER TABLE public.cron_run_log ENABLE ROW LEVEL SECURITY;

-- Append-only via trigger (no UPDATE except via RPC, no DELETE except retention)
CREATE OR REPLACE FUNCTION public.cron_run_log_block_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Allow updates only when called via SECURITY DEFINER RPC (session_user = postgres or current_setting flag)
  IF current_setting('app.cron_run_log_internal', true) = 'true' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'cron_run_log is append-only — use cron_log_finish RPC' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS cron_run_log_no_update ON public.cron_run_log;
CREATE TRIGGER cron_run_log_no_update
  BEFORE UPDATE ON public.cron_run_log
  FOR EACH ROW EXECUTE FUNCTION public.cron_run_log_block_mutation();

DROP TRIGGER IF EXISTS cron_run_log_no_delete ON public.cron_run_log;
CREATE TRIGGER cron_run_log_no_delete
  BEFORE DELETE ON public.cron_run_log
  FOR EACH ROW EXECUTE FUNCTION public.cron_run_log_block_mutation();

DROP POLICY IF EXISTS cron_run_log_admin_select ON public.cron_run_log;
CREATE POLICY cron_run_log_admin_select ON public.cron_run_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ceo'));

REVOKE ALL ON public.cron_run_log FROM anon, authenticated;
GRANT SELECT ON public.cron_run_log TO authenticated;

-- 3. RPC: cron_log_start (called from job command via SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.cron_log_start(
  p_job_name text,
  p_brand_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id bigint;
BEGIN
  IF p_job_name IS NULL OR length(trim(p_job_name)) = 0 THEN
    RAISE EXCEPTION 'p_job_name is required' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.cron_run_log(job_name, brand_id, started_at, status, metadata)
  VALUES (p_job_name, p_brand_id, now(), 'running', COALESCE(p_metadata, '{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.cron_log_start(text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cron_log_start(text, uuid, jsonb) TO postgres, service_role;

-- 4. RPC: cron_log_finish
CREATE OR REPLACE FUNCTION public.cron_log_finish(
  p_run_id bigint,
  p_status text,
  p_error_summary text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_started timestamptz;
BEGIN
  IF p_status NOT IN ('success','error','skipped') THEN
    RAISE EXCEPTION 'invalid status %', p_status USING ERRCODE = '22023';
  END IF;
  SELECT started_at INTO v_started FROM public.cron_run_log WHERE id = p_run_id;
  IF v_started IS NULL THEN
    RAISE EXCEPTION 'cron run % not found', p_run_id USING ERRCODE = 'P0002';
  END IF;
  PERFORM set_config('app.cron_run_log_internal', 'true', true);
  UPDATE public.cron_run_log
    SET finished_at = now(),
        duration_ms = GREATEST(0, EXTRACT(EPOCH FROM (now() - v_started))::int * 1000),
        status = p_status,
        error_summary = CASE
          WHEN p_error_summary IS NULL THEN NULL
          ELSE substring(p_error_summary from 1 for 500)
        END
  WHERE id = p_run_id;
  PERFORM set_config('app.cron_run_log_internal', 'false', true);
END;
$$;

REVOKE ALL ON FUNCTION public.cron_log_finish(bigint, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cron_log_finish(bigint, text, text) TO postgres, service_role;

-- 5. RPC: list_cron_jobs (admin/CEO only, masks JWT in commands)
CREATE OR REPLACE FUNCTION public.list_cron_jobs()
RETURNS TABLE(
  jobid bigint,
  jobname text,
  schedule text,
  active boolean,
  command_redacted text,
  registered boolean,
  tenant_scope text,
  brand_id uuid,
  owner_role text,
  is_critical boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ceo')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    j.jobid::bigint,
    j.jobname::text,
    j.schedule::text,
    j.active,
    -- mask any Bearer token / apikey / decrypted_secret reference
    regexp_replace(
      regexp_replace(
        regexp_replace(j.command::text, 'Bearer\s+[A-Za-z0-9._\-]+', 'Bearer ***REDACTED***', 'gi'),
        '"apikey"\s*:\s*"[^"]+"', '"apikey":"***REDACTED***"', 'gi'
      ),
      'eyJ[A-Za-z0-9._\-]{20,}', '***JWT_REDACTED***', 'g'
    ) AS command_redacted,
    (r.id IS NOT NULL) AS registered,
    r.tenant_scope,
    r.brand_id,
    r.owner_role,
    COALESCE(r.is_critical, false)
  FROM cron.job j
  LEFT JOIN public.cron_job_registry r ON r.job_name = j.jobname
  ORDER BY j.jobid;
END;
$$;

REVOKE ALL ON FUNCTION public.list_cron_jobs() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_cron_jobs() TO authenticated;

-- 6. RPC: detect_unregistered_cron_jobs — drift detection
CREATE OR REPLACE FUNCTION public.detect_unregistered_cron_jobs()
RETURNS TABLE(jobname text, jobid bigint, schedule text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ceo')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT j.jobname::text, j.jobid::bigint, j.schedule::text
  FROM cron.job j
  LEFT JOIN public.cron_job_registry r ON r.job_name = j.jobname
  WHERE r.id IS NULL
  ORDER BY j.jobid;
END;
$$;

REVOKE ALL ON FUNCTION public.detect_unregistered_cron_jobs() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.detect_unregistered_cron_jobs() TO authenticated;

-- 7. updated_at trigger for registry
CREATE OR REPLACE FUNCTION public.cron_job_registry_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := COALESCE(public.get_user_id(auth.uid()), NEW.updated_by);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cron_job_registry_touch_trg ON public.cron_job_registry;
CREATE TRIGGER cron_job_registry_touch_trg
  BEFORE UPDATE ON public.cron_job_registry
  FOR EACH ROW EXECUTE FUNCTION public.cron_job_registry_touch_updated_at();

-- 8. Hardening REVOKEs su funzioni di maintenance richiamate da cron:
--    impediamo che client autenticati o anon le invochino direttamente.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname='cleanup_outbound_webhook_deliveries' AND pronamespace='public'::regnamespace) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.cleanup_outbound_webhook_deliveries(integer) FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.cleanup_outbound_webhook_deliveries(integer) TO postgres, service_role';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname='cleanup_webhook_dedup' AND pronamespace='public'::regnamespace) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.cleanup_webhook_dedup() FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.cleanup_webhook_dedup() TO postgres, service_role';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname='run_audit_retention' AND pronamespace='public'::regnamespace) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.run_audit_retention(uuid, boolean) FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.run_audit_retention(uuid, boolean) TO postgres, service_role';
    -- run_audit_retention può essere utile anche per admin via UI; manteniamo authenticated
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.run_audit_retention(uuid, boolean) TO authenticated';
  END IF;
END $$;

COMMENT ON TABLE public.cron_job_registry IS 'A10 — Catalogo dichiarativo dei cron job: tenant scope (system/brand/user), owner, criticità. Drift rilevato via detect_unregistered_cron_jobs().';
COMMENT ON TABLE public.cron_run_log IS 'A10 — Log append-only delle esecuzioni cron. Scritto via cron_log_start/cron_log_finish RPC. Letto da admin/CEO.';
