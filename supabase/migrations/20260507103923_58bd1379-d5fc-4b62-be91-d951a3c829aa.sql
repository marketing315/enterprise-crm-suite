
UPDATE public.backup_schedules
SET enabled = false, updated_at = now()
WHERE brand_id = 'e2e7e57e-0000-4000-8000-000000000001';
