
-- DB wrapper per invocare l'edge function db-growth-alert
-- Risolve URL/anon-key da public.system_settings (portabile fra ambienti)

CREATE OR REPLACE FUNCTION public.invoke_db_growth_alert()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_key text;
  v_request_id bigint;
BEGIN
  SELECT value #>> '{}' INTO v_url
  FROM public.system_settings
  WHERE key = 'edge_functions_base_url';

  SELECT value #>> '{}' INTO v_key
  FROM public.system_settings
  WHERE key = 'supabase_anon_key';

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE WARNING 'invoke_db_growth_alert: missing system_settings (edge_functions_base_url / supabase_anon_key)';
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url := v_url || '/db-growth-alert',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_key,
      'Authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object('triggered_at', now())
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.invoke_db_growth_alert() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invoke_db_growth_alert() TO postgres;

COMMENT ON FUNCTION public.invoke_db_growth_alert() IS
  'Cron wrapper per edge function db-growth-alert. URL/anon-key risolti da system_settings per portabilità (ADR-001).';
