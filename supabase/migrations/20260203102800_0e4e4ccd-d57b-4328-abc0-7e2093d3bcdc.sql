
-- Fix cron jobs to include x-cron-secret header

-- Job 1: ai-classify (every minute)
SELECT cron.unschedule(1);
SELECT cron.schedule(
  'ai-classify-processor',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://qmqcjtmcxfqahhubpaea.supabase.co/functions/v1/ai-classify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtcWNqdG1jeGZxYWhodWJwYWVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxOTAxNjMsImV4cCI6MjA4NDc2NjE2M30.dEquxxLGm9VfT2_T8ty3dakAytK9ePoUjT5x7IKbK-o',
      'x-cron-secret', current_setting('app.settings.cron_secret', true)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- Job 2: ticket-assign-recovery (every 2 minutes)
SELECT cron.unschedule(2);
SELECT cron.schedule(
  'ticket-assign-recovery',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://qmqcjtmcxfqahhubpaea.supabase.co/functions/v1/ticket-assign-recovery',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtcWNqdG1jeGZxYWhodWJwYWVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxOTAxNjMsImV4cCI6MjA4NDc2NjE2M30.dEquxxLGm9VfT2_T8ty3dakAytK9ePoUjT5x7IKbK-o',
      'x-cron-secret', current_setting('app.settings.cron_secret', true)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- Job 3: sla-breach-checker (every 5 minutes)
SELECT cron.unschedule(3);
SELECT cron.schedule(
  'sla-breach-checker',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://qmqcjtmcxfqahhubpaea.supabase.co/functions/v1/sla-breach-checker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtcWNqdG1jeGZxYWhodWJwYWVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxOTAxNjMsImV4cCI6MjA4NDc2NjE2M30.dEquxxLGm9VfT2_T8ty3dakAytK9ePoUjT5x7IKbK-o',
      'x-cron-secret', current_setting('app.settings.cron_secret', true)
    ),
    body := jsonb_build_object('triggered_by', 'cron')
  ) AS request_id;
  $$
);
