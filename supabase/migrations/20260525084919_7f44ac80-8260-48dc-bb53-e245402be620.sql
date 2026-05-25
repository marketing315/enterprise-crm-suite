DO $$
BEGIN
  PERFORM cron.unschedule('data-retention-cleanup-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'data-retention-cleanup-daily',
  '30 2 * * *',
  $$ SELECT public.run_data_retention_cleanup(NULL, false, 'cron'); $$
);