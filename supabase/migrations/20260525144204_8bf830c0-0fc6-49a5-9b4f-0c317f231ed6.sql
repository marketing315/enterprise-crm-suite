
ALTER TABLE public.voispeed_configs
  ADD COLUMN IF NOT EXISTS poll_ivr_service text NOT NULL DEFAULT 'ivr_tree',
  ADD COLUMN IF NOT EXISTS last_ivr_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_ivr_sync_error text;

SELECT cron.unschedule('voispeed-ivr-sync-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='voispeed-ivr-sync-daily');

SELECT cron.schedule(
  'voispeed-ivr-sync-daily',
  '17 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://qmqcjtmcxfqahhubpaea.supabase.co/functions/v1/voispeed-ivr-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='CRON_SECRET' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);

INSERT INTO public.cron_job_registry (job_name, tenant_scope, description, owner_role, schedule_doc, is_critical, invokes_security_definer)
VALUES (
  'voispeed-ivr-sync-daily',
  'system',
  'Daily sync of VoiSpeed IVR tree (nodes + routing) per brand into voispeed_ivr_nodes',
  'platform',
  'daily 03:17 UTC',
  false,
  false
)
ON CONFLICT (job_name) DO UPDATE
  SET description = EXCLUDED.description,
      schedule_doc = EXCLUDED.schedule_doc,
      updated_at = now();
