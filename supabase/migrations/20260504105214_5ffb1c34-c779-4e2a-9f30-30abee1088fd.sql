-- =====================================================================
-- Replace internal pg_cron jobs to route through `cron-relay` edge function
-- =====================================================================

-- Drop the helper added in the previous migration: not needed anymore
DROP FUNCTION IF EXISTS public.private_cron_secret();

DO $$
DECLARE
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtcWNqdG1jeGZxYWhodWJwYWVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxOTAxNjMsImV4cCI6MjA4NDc2NjE2M30.dEquxxLGm9VfT2_T8ty3dakAytK9ePoUjT5x7IKbK-o';
  v_relay_url text := 'https://qmqcjtmcxfqahhubpaea.supabase.co/functions/v1/cron-relay';
BEGIN
  -- Unschedule existing
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

  -- webhook-dispatcher (every minute) — UNBLOCKS SiLeads outbound deliveries
  PERFORM cron.schedule(
    'webhook-dispatcher-cron', '* * * * *',
    format($f$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer %s'),
        body := jsonb_build_object('target','webhook-dispatcher','payload', jsonb_build_object('triggered_at', now()))
      ) AS request_id;
    $f$, v_relay_url, v_anon)
  );

  PERFORM cron.schedule(
    'ai-classify-processor', '* * * * *',
    format($f$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer %s'),
        body := jsonb_build_object('target','ai-classify','payload','{}'::jsonb)
      ) AS request_id;
    $f$, v_relay_url, v_anon)
  );

  PERFORM cron.schedule(
    'sla-breach-checker-5min', '*/5 * * * *',
    format($f$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer %s'),
        body := jsonb_build_object('target','sla-breach-checker','payload','{}'::jsonb)
      ) AS request_id;
    $f$, v_relay_url, v_anon)
  );

  PERFORM cron.schedule(
    'slo-burn-rate-monitor-5min', '*/5 * * * *',
    format($f$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer %s'),
        body := jsonb_build_object('target','slo-burn-rate-monitor','payload','{}'::jsonb)
      ) AS request_id;
    $f$, v_relay_url, v_anon)
  );

  PERFORM cron.schedule(
    'ticket-escalation-runner-5min', '*/5 * * * *',
    format($f$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer %s'),
        body := jsonb_build_object('target','ticket-escalation-runner','payload','{}'::jsonb)
      ) AS request_id;
    $f$, v_relay_url, v_anon)
  );

  PERFORM cron.schedule(
    'capi-event-sender', '*/2 * * * *',
    format($f$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer %s'),
        body := jsonb_build_object('target','capi-event-sender','payload', jsonb_build_object('source','pg_cron'), 'timeout_ms', 30000)
      ) AS request_id;
    $f$, v_relay_url, v_anon)
  );

  PERFORM cron.schedule(
    'automation-runner-every-minute', '* * * * *',
    format($f$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer %s'),
        body := jsonb_build_object('target','automation-runner','payload', jsonb_build_object('trigger','cron'))
      ) AS request_id;
    $f$, v_relay_url, v_anon)
  );

  PERFORM cron.schedule(
    'automation-jobs-dispatcher', '* * * * *',
    format($f$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer %s'),
        body := jsonb_build_object('target','automation-jobs-dispatcher','payload', jsonb_build_object('trigger','cron'))
      ) AS request_id;
    $f$, v_relay_url, v_anon)
  );

  PERFORM cron.schedule(
    'lead-digest-dispatch-minutely', '* * * * *',
    format($f$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer %s'),
        body := jsonb_build_object('target','lead-digest-dispatch','payload', jsonb_build_object('trigger_type','scheduled'))
      ) AS request_id;
    $f$, v_relay_url, v_anon)
  );

  PERFORM cron.schedule(
    'lead-digest-retry-every-5min', '*/5 * * * *',
    format($f$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer %s'),
        body := jsonb_build_object('target','lead-digest-retry-dispatcher','payload','{}'::jsonb)
      ) AS request_id;
    $f$, v_relay_url, v_anon)
  );

  PERFORM cron.schedule(
    'notification-webhook-dispatcher-1min', '* * * * *',
    format($f$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer %s'),
        body := jsonb_build_object('target','notification-webhook-dispatcher','payload','{}'::jsonb)
      ) AS request_id;
    $f$, v_relay_url, v_anon)
  );

  PERFORM cron.schedule(
    'ads-stats-meta-sync', '* * * * *',
    format($f$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer %s'),
        body := jsonb_build_object(
          'target','ads-stats-meta',
          'query','?from=' || to_char(CURRENT_DATE - INTERVAL '2 days','YYYY-MM-DD') || '&to=' || to_char(CURRENT_DATE,'YYYY-MM-DD'),
          'payload','{}'::jsonb
        )
      ) AS request_id;
    $f$, v_relay_url, v_anon)
  );

  PERFORM cron.schedule(
    'google-ads-sync-5min', '*/5 * * * *',
    format($f$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer %s'),
        body := jsonb_build_object('target','google-ads-sync','payload','{}'::jsonb)
      ) AS request_id;
    $f$, v_relay_url, v_anon)
  );
END $$;