-- =====================================================================
-- Fix: pg_cron jobs failing 401 against hardened internal edge functions
-- Strategy: read CRON_SECRET from Vault and pass it as `x-cron-secret`
-- =====================================================================

-- 1) Helper to read the cron secret from Vault. SECURITY DEFINER so cron
--    (running as postgres) can read decrypted_secrets without granting
--    broad access to other roles.
CREATE OR REPLACE FUNCTION public.private_cron_secret()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, vault
AS $$
  SELECT decrypted_secret
  FROM vault.decrypted_secrets
  WHERE name = 'cron_secret'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.private_cron_secret() FROM PUBLIC, anon, authenticated;

-- 2) Reschedule all internal cron jobs to send `x-cron-secret`.
--    Anon Bearer is kept as a fallback for functions still on the old
--    pattern; hardened ones will use x-cron-secret. Both are safe to send.

-- Helper to (re)schedule
DO $$
DECLARE
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtcWNqdG1jeGZxYWhodWJwYWVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxOTAxNjMsImV4cCI6MjA4NDc2NjE2M30.dEquxxLGm9VfT2_T8ty3dakAytK9ePoUjT5x7IKbK-o';
  v_url_base text := 'https://qmqcjtmcxfqahhubpaea.supabase.co/functions/v1/';
BEGIN
  -- Unschedule existing (ignore errors if not present)
  PERFORM cron.unschedule(jobname) FROM cron.job
  WHERE jobname IN (
    'webhook-dispatcher-cron',
    'ai-classify-processor',
    'sla-breach-checker-5min',
    'slo-burn-rate-monitor-5min',
    'ticket-escalation-runner-5min',
    'capi-event-sender',
    'automation-runner-every-minute',
    'automation-jobs-dispatcher',
    'lead-digest-dispatch-minutely',
    'lead-digest-retry-every-5min',
    'notification-webhook-dispatcher-1min',
    'ads-stats-meta-sync',
    'google-ads-sync-5min'
  );

  -- webhook-dispatcher (every minute)
  PERFORM cron.schedule(
    'webhook-dispatcher-cron',
    '* * * * *',
    format($f$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'Authorization','Bearer %s',
          'x-cron-secret', public.private_cron_secret()
        ),
        body := jsonb_build_object('triggered_at', now())
      ) AS request_id;
    $f$, v_url_base || 'webhook-dispatcher', v_anon)
  );

  -- ai-classify
  PERFORM cron.schedule(
    'ai-classify-processor', '* * * * *',
    format($f$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'Authorization','Bearer %s',
          'x-cron-secret', public.private_cron_secret()
        ),
        body := '{}'::jsonb
      ) AS request_id;
    $f$, v_url_base || 'ai-classify', v_anon)
  );

  -- sla-breach-checker (every 5 min)
  PERFORM cron.schedule(
    'sla-breach-checker-5min', '*/5 * * * *',
    format($f$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'Authorization','Bearer %s',
          'x-cron-secret', public.private_cron_secret()
        ),
        body := '{}'::jsonb
      ) AS request_id;
    $f$, v_url_base || 'sla-breach-checker', v_anon)
  );

  -- slo-burn-rate-monitor (every 5 min)
  PERFORM cron.schedule(
    'slo-burn-rate-monitor-5min', '*/5 * * * *',
    format($f$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'Authorization','Bearer %s',
          'x-cron-secret', public.private_cron_secret()
        ),
        body := '{}'::jsonb
      ) AS request_id;
    $f$, v_url_base || 'slo-burn-rate-monitor', v_anon)
  );

  -- ticket-escalation-runner (every 5 min)
  PERFORM cron.schedule(
    'ticket-escalation-runner-5min', '*/5 * * * *',
    format($f$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'Authorization','Bearer %s',
          'x-cron-secret', public.private_cron_secret()
        ),
        body := '{}'::jsonb
      ) AS request_id;
    $f$, v_url_base || 'ticket-escalation-runner', v_anon)
  );

  -- capi-event-sender (every 2 min)
  PERFORM cron.schedule(
    'capi-event-sender', '*/2 * * * *',
    format($f$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'Authorization','Bearer %s',
          'x-cron-secret', public.private_cron_secret()
        ),
        body := '{"source":"pg_cron"}'::jsonb,
        timeout_milliseconds := 30000
      ) AS request_id;
    $f$, v_url_base || 'capi-event-sender', v_anon)
  );

  -- automation-runner (every minute)
  PERFORM cron.schedule(
    'automation-runner-every-minute', '* * * * *',
    format($f$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'Authorization','Bearer %s',
          'x-cron-secret', public.private_cron_secret()
        ),
        body := '{"trigger":"cron"}'::jsonb
      ) AS request_id;
    $f$, v_url_base || 'automation-runner', v_anon)
  );

  -- automation-jobs-dispatcher (every minute)
  PERFORM cron.schedule(
    'automation-jobs-dispatcher', '* * * * *',
    format($f$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'Authorization','Bearer %s',
          'x-cron-secret', public.private_cron_secret()
        ),
        body := '{"trigger":"cron"}'::jsonb
      ) AS request_id;
    $f$, v_url_base || 'automation-jobs-dispatcher', v_anon)
  );

  -- lead-digest-dispatch (every minute)
  PERFORM cron.schedule(
    'lead-digest-dispatch-minutely', '* * * * *',
    format($f$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'Authorization','Bearer %s',
          'x-cron-secret', public.private_cron_secret()
        ),
        body := '{"trigger_type":"scheduled"}'::jsonb
      ) AS request_id;
    $f$, v_url_base || 'lead-digest-dispatch', v_anon)
  );

  -- lead-digest-retry-dispatcher (every 5 min)
  PERFORM cron.schedule(
    'lead-digest-retry-every-5min', '*/5 * * * *',
    format($f$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'Authorization','Bearer %s',
          'x-cron-secret', public.private_cron_secret()
        ),
        body := '{}'::jsonb
      ) AS request_id;
    $f$, v_url_base || 'lead-digest-retry-dispatcher', v_anon)
  );

  -- notification-webhook-dispatcher (every minute)
  PERFORM cron.schedule(
    'notification-webhook-dispatcher-1min', '* * * * *',
    format($f$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'Authorization','Bearer %s',
          'x-cron-secret', public.private_cron_secret()
        ),
        body := '{}'::jsonb
      ) AS request_id;
    $f$, v_url_base || 'notification-webhook-dispatcher', v_anon)
  );

  -- ads-stats-meta-sync (every minute)
  PERFORM cron.schedule(
    'ads-stats-meta-sync', '* * * * *',
    format($f$
      SELECT net.http_post(
        url := %L || '?from=' || to_char(CURRENT_DATE - INTERVAL '2 days','YYYY-MM-DD') || '&to=' || to_char(CURRENT_DATE,'YYYY-MM-DD'),
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'Authorization','Bearer %s',
          'x-cron-secret', public.private_cron_secret()
        ),
        body := '{}'::jsonb
      ) AS request_id;
    $f$, v_url_base || 'ads-stats-meta', v_anon)
  );

  -- google-ads-sync (every 5 min)
  PERFORM cron.schedule(
    'google-ads-sync-5min', '*/5 * * * *',
    format($f$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'Authorization','Bearer %s',
          'x-cron-secret', public.private_cron_secret()
        ),
        body := '{}'::jsonb
      ) AS request_id;
    $f$, v_url_base || 'google-ads-sync', v_anon)
  );
END $$;