SELECT cron.unschedule(42);

SELECT cron.schedule(
  'webhook-dispatcher-cron',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://qmqcjtmcxfqahhubpaea.supabase.co/functions/v1/webhook-dispatcher',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1)
    ),
    body := jsonb_build_object('triggered_at', now())
  ) AS request_id;
  $$
);