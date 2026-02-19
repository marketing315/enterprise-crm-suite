-- Fix digest cron jobs: use anon key Bearer token (same pattern as all other cron jobs)
-- instead of x-cron-secret which requires app.cron_secret pg setting (not set)

SELECT cron.unschedule('lead-digest-dispatch-minutely');
SELECT cron.unschedule('lead-digest-retry-every-5min');

SELECT cron.schedule(
  'lead-digest-dispatch-minutely',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://qmqcjtmcxfqahhubpaea.supabase.co/functions/v1/lead-digest-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtcWNqdG1jeGZxYWhodWJwYWVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxOTAxNjMsImV4cCI6MjA4NDc2NjE2M30.dEquxxLGm9VfT2_T8ty3dakAytK9ePoUjT5x7IKbK-o',
      'x-cron-secret', current_setting('app.cron_secret', true)
    ),
    body := '{"trigger_type": "scheduled"}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'lead-digest-retry-every-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://qmqcjtmcxfqahhubpaea.supabase.co/functions/v1/lead-digest-retry-dispatcher',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtcWNqdG1jeGZxYWhodWJwYWVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxOTAxNjMsImV4cCI6MjA4NDc2NjE2M30.dEquxxLGm9VfT2_T8ty3dakAytK9ePoUjT5x7IKbK-o'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);