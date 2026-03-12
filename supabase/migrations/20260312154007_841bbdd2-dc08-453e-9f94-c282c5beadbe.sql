SELECT cron.unschedule(16);

SELECT cron.schedule(
  'webhook-dispatcher-cron',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://qmqcjtmcxfqahhubpaea.supabase.co/functions/v1/webhook-dispatcher',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.settings.cron_secret', true)
    ),
    body := jsonb_build_object('triggered_at', now())
  ) AS request_id;
  $$
);