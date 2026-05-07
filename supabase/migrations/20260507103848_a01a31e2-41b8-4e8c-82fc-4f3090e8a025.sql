
INSERT INTO public.backup_schedules
  (brand_id, scope, frequency, hour_utc, day_of_week, retention_days, enabled)
VALUES
  ('e2e7e57e-0000-4000-8000-000000000001', 'minimal', 'daily', 10, NULL, 7, true)
ON CONFLICT (brand_id) DO UPDATE SET
  scope = 'minimal',
  hour_utc = 10,
  enabled = true,
  last_run_at = NULL,
  updated_at = now();
