
-- Update cron to use service_role key for ads-stats-meta
SELECT cron.unschedule('ads-stats-meta-sync');

SELECT cron.schedule(
  'ads-stats-meta-sync',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://qmqcjtmcxfqahhubpaea.supabase.co/functions/v1/ads-stats-meta?from=' || to_char(CURRENT_DATE - INTERVAL '2 days', 'YYYY-MM-DD') || '&to=' || to_char(CURRENT_DATE, 'YYYY-MM-DD'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
