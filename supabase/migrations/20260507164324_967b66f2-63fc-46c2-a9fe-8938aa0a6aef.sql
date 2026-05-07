
-- D1: rimuovi dalla publication realtime le tabelle non ascoltate da nessun hook frontend
-- (verificato grep su src/hooks/*.ts -> useGlobalRealtime + dedicated hooks)
-- Reversibile: ALTER PUBLICATION supabase_realtime ADD TABLE <name>;

DO $$
DECLARE
  t text;
  unused_tables text[] := ARRAY[
    'automation_jobs',
    'call_logs',
    'call_transcripts',
    'chat_message_reads',
    'deal_stage_transitions',
    'system_settings',
    'thread_read_state',
    'webhook_inbound_events',
    'ai_call_action_proposals'
  ];
BEGIN
  FOREACH t IN ARRAY unused_tables LOOP
    IF EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', t);
      RAISE NOTICE 'Removed % from supabase_realtime publication', t;
    END IF;
  END LOOP;
END $$;

-- D3: indici mancanti (CONCURRENTLY non possibile in migration tx; uso normale)
CREATE INDEX IF NOT EXISTS idx_ad_sync_log_provider_account_to
  ON public.ad_sync_log(provider, account_id, sync_to DESC);

CREATE INDEX IF NOT EXISTS idx_ai_jobs_pending
  ON public.ai_jobs(status, created_at)
  WHERE status IN ('pending','processing');

-- D4: cron VACUUM ANALYZE settimanale (domenica 03:00 UTC) sulle hot tables
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='vacuum-analyze-hot-tables-weekly') THEN
    PERFORM cron.unschedule('vacuum-analyze-hot-tables-weekly');
  END IF;
END $$;

SELECT cron.schedule(
  'vacuum-analyze-hot-tables-weekly',
  '0 3 * * 0',
  $cmd$
    VACUUM (ANALYZE) public.contacts;
    VACUUM (ANALYZE) public.deals;
    VACUUM (ANALYZE) public.appointments;
    VACUUM (ANALYZE) public.tickets;
    VACUUM (ANALYZE) public.lead_events;
    VACUUM (ANALYZE) public.ad_sync_log;
    VACUUM (ANALYZE) public.ai_jobs;
  $cmd$
);
