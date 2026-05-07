-- ============================================================
-- Fase 4 + Vista v_io_pressure (parte applicabile via migration)
-- ============================================================

-- 1) Vista diagnostica top scrittori (Fase 2 punto 7 del piano)
CREATE OR REPLACE VIEW public.v_io_pressure AS
SELECT
  schemaname || '.' || relname AS table_name,
  n_tup_ins + n_tup_upd + n_tup_del AS total_writes,
  n_tup_ins, n_tup_upd, n_tup_del,
  n_dead_tup,
  CASE WHEN n_live_tup > 0
       THEN round((n_dead_tup::numeric / n_live_tup) * 100, 1)
       ELSE 0 END AS dead_pct,
  pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
  pg_total_relation_size(relid) AS total_size_bytes,
  last_autovacuum, last_autoanalyze
FROM pg_stat_user_tables
ORDER BY total_writes DESC;

REVOKE ALL ON public.v_io_pressure FROM PUBLIC;
GRANT SELECT ON public.v_io_pressure TO authenticated, service_role;

-- 2) Fase 4: rebalancing cron (riduzione frequenza job non SLA-critical)
DO $$
DECLARE j record;
BEGIN
  -- unschedule tutti quelli da rivedere (idempotente)
  FOR j IN
    SELECT jobid FROM cron.job
    WHERE jobname IN (
      'automation-runner-every-minute',
      'automation-jobs-dispatcher',
      'lead-digest-dispatch-minutely',
      'ads-stats-meta-sync',
      'ticket-assign-recovery-2min'
    )
  LOOP
    PERFORM cron.unschedule(j.jobid);
  END LOOP;
END $$;

-- I cron sopra sono ricreati nella migration successiva via insert tool
-- (contengono URL + anon key, non possono stare in migration)
