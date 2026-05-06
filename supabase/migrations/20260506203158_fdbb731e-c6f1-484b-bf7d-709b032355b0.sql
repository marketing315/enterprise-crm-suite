DO $do$
DECLARE v_deleted bigint;
BEGIN
  PERFORM set_config('app.cron_relay_log_allow_cleanup', 'on', true);
  DELETE FROM public.cron_relay_log WHERE error = 'lock_held';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE 'lock_held historical cleanup: % rows', v_deleted;
END
$do$;