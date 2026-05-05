SELECT cron.schedule(
  'backup-freshness-monitor-hourly',
  '17 * * * *',
  $$SELECT public.check_backup_freshness(36);$$
);