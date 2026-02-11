-- Fix cron job: use x-cron-secret header instead of anon Bearer token
-- This is required after H06 security fix that correctly rejects anon keys

SELECT cron.unschedule('capi-event-sender');

SELECT cron.schedule(
  'capi-event-sender',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://qmqcjtmcxfqahhubpaea.supabase.co/functions/v1/capi-event-sender',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);