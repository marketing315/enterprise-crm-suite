CREATE OR REPLACE FUNCTION public.acquire_cron_lease(p_job_name text, p_brand_id uuid DEFAULT NULL::uuid, p_ttl_seconds integer DEFAULT 300, p_acquired_by text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_token text;
  v_until timestamptz;
  v_ttl int;
BEGIN
  v_ttl := GREATEST(LEAST(COALESCE(p_ttl_seconds, 300), 3600), 30);
  -- Fully-qualified to survive search_path drift (pgcrypto lives in `extensions`).
  v_token := encode(extensions.gen_random_bytes(16), 'hex');
  v_until := now() + (v_ttl || ' seconds')::interval;

  BEGIN
    INSERT INTO public.cron_job_lease (job_name, brand_id, lease_token, lease_until, acquired_by)
    VALUES (p_job_name, p_brand_id, v_token, v_until, p_acquired_by);
    RETURN jsonb_build_object('acquired', true, 'token', v_token, 'lease_until', v_until);
  EXCEPTION WHEN unique_violation THEN
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
END$function$;