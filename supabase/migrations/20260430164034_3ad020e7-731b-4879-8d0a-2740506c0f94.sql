INSERT INTO storage.buckets (id, name, public)
VALUES ('backup-archives', 'backup-archives', false)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.backup_runs
  ADD COLUMN IF NOT EXISTS storage_path TEXT,
  ADD COLUMN IF NOT EXISTS storage_uploaded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS schedule_id UUID,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_backup_runs_brand_storage
  ON public.backup_runs (brand_id, storage_uploaded_at DESC)
  WHERE storage_path IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_backup_runs_expires
  ON public.backup_runs (expires_at)
  WHERE expires_at IS NOT NULL AND storage_path IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.backup_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL,
  scope TEXT NOT NULL DEFAULT 'standard' CHECK (scope IN ('minimal', 'standard', 'full')),
  frequency TEXT NOT NULL DEFAULT 'daily' CHECK (frequency IN ('daily', 'weekly')),
  hour_utc INT NOT NULL DEFAULT 3 CHECK (hour_utc BETWEEN 0 AND 23),
  day_of_week INT CHECK (day_of_week BETWEEN 0 AND 6),
  retention_days INT NOT NULL DEFAULT 30 CHECK (retention_days BETWEEN 1 AND 365),
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_run_at TIMESTAMPTZ,
  last_run_status TEXT,
  next_run_at TIMESTAMPTZ,
  created_by_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (brand_id)
);

ALTER TABLE public.backup_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "backup_schedules_admin_select"
ON public.backup_schedules FOR SELECT TO authenticated
USING (
  public.has_role(public.get_user_id(auth.uid()), 'admin'::app_role)
  OR public.has_role(public.get_user_id(auth.uid()), 'ceo'::app_role)
);

CREATE POLICY "backup_schedules_admin_modify"
ON public.backup_schedules FOR ALL TO authenticated
USING (
  public.has_role(public.get_user_id(auth.uid()), 'admin'::app_role)
  OR public.has_role(public.get_user_id(auth.uid()), 'ceo'::app_role)
)
WITH CHECK (
  public.has_role(public.get_user_id(auth.uid()), 'admin'::app_role)
  OR public.has_role(public.get_user_id(auth.uid()), 'ceo'::app_role)
);

CREATE TRIGGER trg_backup_schedules_updated_at
BEFORE UPDATE ON public.backup_schedules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.get_backup_schedules()
RETURNS TABLE (
  id UUID,
  brand_id UUID,
  brand_name TEXT,
  scope TEXT,
  frequency TEXT,
  hour_utc INT,
  day_of_week INT,
  retention_days INT,
  enabled BOOLEAN,
  last_run_at TIMESTAMPTZ,
  last_run_status TEXT,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.has_role(public.get_user_id(auth.uid()), 'admin'::app_role)
    OR public.has_role(public.get_user_id(auth.uid()), 'ceo'::app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT s.id, s.brand_id, b.name AS brand_name, s.scope, s.frequency,
         s.hour_utc, s.day_of_week, s.retention_days, s.enabled,
         s.last_run_at, s.last_run_status, s.next_run_at,
         s.created_at, s.updated_at
  FROM public.backup_schedules s
  LEFT JOIN public.brands b ON b.id = s.brand_id
  ORDER BY b.name NULLS LAST
  LIMIT 500;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_backup_schedule(
  p_brand_id UUID,
  p_scope TEXT,
  p_frequency TEXT,
  p_hour_utc INT,
  p_day_of_week INT,
  p_retention_days INT,
  p_enabled BOOLEAN
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_id UUID;
BEGIN
  v_user_id := public.get_user_id(auth.uid());
  IF NOT (
    public.has_role(v_user_id, 'admin'::app_role)
    OR public.has_role(v_user_id, 'ceo'::app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.backup_schedules (
    brand_id, scope, frequency, hour_utc, day_of_week,
    retention_days, enabled, created_by_user_id
  ) VALUES (
    p_brand_id, p_scope, p_frequency, p_hour_utc, p_day_of_week,
    p_retention_days, p_enabled, v_user_id
  )
  ON CONFLICT (brand_id) DO UPDATE SET
    scope = EXCLUDED.scope,
    frequency = EXCLUDED.frequency,
    hour_utc = EXCLUDED.hour_utc,
    day_of_week = EXCLUDED.day_of_week,
    retention_days = EXCLUDED.retention_days,
    enabled = EXCLUDED.enabled,
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_backup_archives(
  p_brand_id UUID,
  p_limit INT DEFAULT 100
)
RETURNS TABLE (
  run_id UUID,
  brand_id UUID,
  scope TEXT,
  storage_path TEXT,
  storage_uploaded_at TIMESTAMPTZ,
  size_bytes BIGINT,
  total_rows INT,
  status TEXT,
  expires_at TIMESTAMPTZ,
  scheduled BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.has_role(public.get_user_id(auth.uid()), 'admin'::app_role)
    OR public.has_role(public.get_user_id(auth.uid()), 'ceo'::app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT r.id, r.brand_id, r.scope, r.storage_path, r.storage_uploaded_at,
         r.size_bytes, r.total_rows, r.status, r.expires_at,
         (r.schedule_id IS NOT NULL) AS scheduled,
         r.created_at
  FROM public.backup_runs r
  WHERE r.brand_id = p_brand_id
    AND r.storage_path IS NOT NULL
  ORDER BY r.storage_uploaded_at DESC NULLS LAST
  LIMIT LEAST(GREATEST(p_limit, 1), 500);
END;
$$;

CREATE POLICY "backup_archives_admin_read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'backup-archives'
  AND (
    public.has_role(public.get_user_id(auth.uid()), 'admin'::app_role)
    OR public.has_role(public.get_user_id(auth.uid()), 'ceo'::app_role)
  )
);

REVOKE EXECUTE ON FUNCTION public.get_backup_schedules() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.upsert_backup_schedule(UUID, TEXT, TEXT, INT, INT, INT, BOOLEAN) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.list_backup_archives(UUID, INT) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_backup_schedules() TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_backup_schedule(UUID, TEXT, TEXT, INT, INT, INT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_backup_archives(UUID, INT) TO authenticated;