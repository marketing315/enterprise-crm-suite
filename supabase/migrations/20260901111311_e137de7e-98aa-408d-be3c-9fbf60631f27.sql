CREATE OR REPLACE FUNCTION public.capture_capacity_snapshot()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_db_size_mb numeric;
  v_contacts_count bigint;
  v_webhooks_today bigint;
  v_audit_today bigint;
  v_failed_jobs bigint;
  v_uid uuid := public.get_user_id(auth.uid());
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (
    public.has_role(v_uid, 'admin'::app_role) OR public.has_role(v_uid, 'ceo'::app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT pg_database_size(current_database())::numeric / 1024 / 1024 INTO v_db_size_mb;
  SELECT count(*) INTO v_contacts_count FROM public.contacts;
  SELECT count(*) INTO v_webhooks_today FROM public.incoming_requests WHERE created_at > now() - interval '24 hours';
  SELECT count(*) INTO v_audit_today FROM public.audit_events WHERE occurred_at > now() - interval '24 hours';
  SELECT count(*) INTO v_failed_jobs FROM public.incoming_requests WHERE status = 'failed';

  INSERT INTO public.capacity_snapshots (metric_name, metric_value, unit) VALUES
    ('db_size_mb', v_db_size_mb, 'MB'),
    ('contacts_count', v_contacts_count, 'rows'),
    ('webhooks_per_day', v_webhooks_today, 'count'),
    ('audit_events_per_day', v_audit_today, 'count'),
    ('failed_jobs_count', v_failed_jobs, 'count');

  RETURN jsonb_build_object(
    'db_size_mb', v_db_size_mb,
    'contacts_count', v_contacts_count,
    'webhooks_today', v_webhooks_today,
    'audit_today', v_audit_today,
    'failed_jobs', v_failed_jobs
  );
END;
$function$;

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'cleanup-cron-run-log'),
  command := $cmd$ DELETE FROM public.cron_run_log WHERE started_at < now() - interval '30 days'; $cmd$
);