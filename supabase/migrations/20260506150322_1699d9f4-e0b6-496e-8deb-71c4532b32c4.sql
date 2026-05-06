-- HOTFIX: cron-relay invoca acquire_cron_lease senza brand_id per i system job,
-- ma cron_job_lease.brand_id è NOT NULL (parte della PK). Default a System Brand.

ALTER TABLE public.cron_job_lease
  ALTER COLUMN brand_id SET DEFAULT '00000000-0000-0000-0000-000000000000'::uuid;

CREATE OR REPLACE FUNCTION public.acquire_cron_lease(
  p_job_name text,
  p_brand_id uuid DEFAULT NULL::uuid,
  p_ttl_seconds integer DEFAULT 300,
  p_acquired_by text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_token text;
  v_until timestamptz;
  v_ttl int;
  v_brand uuid;
BEGIN
  v_ttl := GREATEST(LEAST(COALESCE(p_ttl_seconds, 300), 3600), 30);
  -- System cron jobs (relay-driven, non tenant-scoped) sono mappati al System Brand
  -- per soddisfare il NOT NULL della PK (job_name, brand_id). I job per-tenant
  -- continuano a passare il loro brand_id reale.
  v_brand := COALESCE(p_brand_id, '00000000-0000-0000-0000-000000000000'::uuid);
  v_token := encode(extensions.gen_random_bytes(16), 'hex');
  v_until := now() + (v_ttl || ' seconds')::interval;

  BEGIN
    INSERT INTO public.cron_job_lease (job_name, brand_id, lease_token, lease_until, acquired_by)
    VALUES (p_job_name, v_brand, v_token, v_until, p_acquired_by);
    RETURN jsonb_build_object('acquired', true, 'token', v_token, 'lease_until', v_until);
  EXCEPTION WHEN unique_violation THEN
    UPDATE public.cron_job_lease
       SET lease_token = v_token,
           acquired_at = now(),
           lease_until = v_until,
           acquired_by = p_acquired_by
     WHERE job_name = p_job_name
       AND brand_id = v_brand
       AND lease_until <= now();
    IF FOUND THEN
      RETURN jsonb_build_object('acquired', true, 'token', v_token, 'lease_until', v_until);
    END IF;
    RETURN jsonb_build_object('acquired', false);
  END;
END$function$;

CREATE OR REPLACE FUNCTION public.release_cron_lease(
  p_job_name text,
  p_brand_id uuid,
  p_token text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_brand uuid;
BEGIN
  v_brand := COALESCE(p_brand_id, '00000000-0000-0000-0000-000000000000'::uuid);
  DELETE FROM public.cron_job_lease
   WHERE job_name = p_job_name
     AND brand_id = v_brand
     AND lease_token = p_token;
  RETURN FOUND;
END$function$;