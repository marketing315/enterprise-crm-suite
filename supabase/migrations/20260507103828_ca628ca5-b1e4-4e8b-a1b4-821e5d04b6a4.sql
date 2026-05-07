
INSERT INTO public.backup_schedules
  (brand_id, scope, frequency, hour_utc, day_of_week, retention_days, enabled)
VALUES
  ('148bfefc-1c1f-4f64-b2d7-29420eb95ec7', 'standard', 'daily', 2, NULL, 30, true),
  ('4a0b6cd1-f15a-4ea6-877d-33dcd0bc94d5', 'standard', 'daily', 2, NULL, 30, true),
  ('2dc052de-26b5-48ef-8dee-917ea591a681', 'standard', 'daily', 2, NULL, 30, true),
  ('ab447ddd-3183-4bd2-982c-641746f0a7f7', 'standard', 'daily', 2, NULL, 30, true)
ON CONFLICT (brand_id) DO UPDATE SET
  scope = EXCLUDED.scope,
  frequency = EXCLUDED.frequency,
  hour_utc = EXCLUDED.hour_utc,
  day_of_week = EXCLUDED.day_of_week,
  retention_days = EXCLUDED.retention_days,
  enabled = EXCLUDED.enabled,
  updated_at = now();
