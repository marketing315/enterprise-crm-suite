
-- Fix ads-stats-meta cron: use x-cron-secret header instead of anon Bearer token
SELECT cron.unschedule('ads-stats-meta-sync');

SELECT cron.schedule(
  'ads-stats-meta-sync',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://qmqcjtmcxfqahhubpaea.supabase.co/functions/v1/ads-stats-meta?from=' || to_char(CURRENT_DATE - INTERVAL '2 days', 'YYYY-MM-DD') || '&to=' || to_char(CURRENT_DATE, 'YYYY-MM-DD'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.cron_secret', true)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
