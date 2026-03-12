SELECT cron.unschedule(43);

SELECT cron.schedule(
  'webhook-dispatcher-cron',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://qmqcjtmcxfqahhubpaea.supabase.co/functions/v1/webhook-dispatcher',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtcWNqdG1jeGZxYWhodWJwYWVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxOTAxNjMsImV4cCI6MjA4NDc2NjE2M30.dEquxxLGm9VfT2_T8ty3dakAytK9ePoUjT5x7IKbK-o'
    ),
    body := jsonb_build_object('triggered_at', now())
  ) AS request_id;
  $$
);