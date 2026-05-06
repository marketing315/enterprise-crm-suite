-- C11: lease-based cron lock (replaces pg_try_advisory_lock which leaks on pgbouncer)
CREATE TABLE IF NOT EXISTS public.cron_job_lease (
  job_name text NOT NULL,
  brand_id uuid,
  lease_token text NOT NULL,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz NOT NULL,
  acquired_by text,
  PRIMARY KEY (job_name, brand_id)
);

-- Treat NULL brand_id as a stable key (PK already handles NULL via composite, but enforce uniqueness explicitly)
CREATE UNIQUE INDEX IF NOT EXISTS cron_job_lease_job_no_brand
  ON public.cron_job_lease (job_name) WHERE brand_id IS NULL;

ALTER TABLE public.cron_job_lease ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cron_job_lease_admin_read ON public.cron_job_lease;
CREATE POLICY cron_job_lease_admin_read ON public.cron_job_lease
  FOR SELECT TO authenticated
  USING (public.has_role(public.get_user_id(auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS cron_job_lease_service ON public.cron_job_lease;
CREATE POLICY cron_job_lease_service ON public.cron_job_lease
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.acquire_cron_lease(
  p_job_name text,
  p_brand_id uuid DEFAULT NULL,
  p_ttl_seconds int DEFAULT 300,
  p_acquired_by text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
  v_until timestamptz;
  v_ttl int;
BEGIN
  v_ttl := GREATEST(LEAST(COALESCE(p_ttl_seconds, 300), 3600), 30);
  v_token := encode(gen_random_bytes(16), 'hex');
  v_until := now() + (v_ttl || ' seconds')::interval;

  -- Try insert first (no row yet)
  BEGIN
    INSERT INTO public.cron_job_lease (job_name, brand_id, lease_token, lease_until, acquired_by)
    VALUES (p_job_name, p_brand_id, v_token, v_until, p_acquired_by);
    RETURN jsonb_build_object('acquired', true, 'token', v_token, 'lease_until', v_until);
  EXCEPTION WHEN unique_violation THEN
    -- Row exists; take only if expired
    UPDATE public.cron_job_lease
       SET lease_token = v_token,
           acquired_at = now(),
           lease_until = v_until,
           acquired_by = p_acquired_by
     WHERE job_name = p_job_name
       AND brand_id IS NOT DISTINCT FROM p_brand_id
       AND lease_until <= now();
    IF FOUND THEN
      RETURN jsonb_build_object('acquired', true, 'token', v_token, 'lease_until', v_until);
    END IF;
    RETURN jsonb_build_object('acquired', false);
  END;
END$$;

REVOKE EXECUTE ON FUNCTION public.acquire_cron_lease(text, uuid, int, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_cron_lease(text, uuid, int, text) TO service_role;

CREATE OR REPLACE FUNCTION public.release_cron_lease(
  p_job_name text,
  p_brand_id uuid,
  p_token text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.cron_job_lease
     SET lease_until = now() - interval '1 second'
   WHERE job_name = p_job_name
     AND brand_id IS NOT DISTINCT FROM p_brand_id
     AND lease_token = p_token
     AND lease_until > now();
  RETURN FOUND;
END$$;

REVOKE EXECUTE ON FUNCTION public.release_cron_lease(text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_cron_lease(text, uuid, text) TO service_role;

-- Append-only guard on cron_relay_log
CREATE OR REPLACE FUNCTION public.cron_relay_log_block_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('role', true) = 'service_role' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'cron_relay_log is append-only';
END$$;

DROP TRIGGER IF EXISTS cron_relay_log_no_update ON public.cron_relay_log;
CREATE TRIGGER cron_relay_log_no_update
  BEFORE UPDATE OR DELETE ON public.cron_relay_log
  FOR EACH ROW EXECUTE FUNCTION public.cron_relay_log_block_mutation();