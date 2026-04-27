-- Schedule cleanup of expired dedup entries every 15 minutes
-- Uses pg_cron (already enabled in this project for other jobs)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove existing job if present (idempotent)
    PERFORM cron.unschedule('cleanup-webhook-dedup')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-webhook-dedup');

    PERFORM cron.schedule(
      'cleanup-webhook-dedup',
      '*/15 * * * *',
      $cron$ SELECT public.cleanup_webhook_dedup(); $cron$
    );
  END IF;
END $$;
