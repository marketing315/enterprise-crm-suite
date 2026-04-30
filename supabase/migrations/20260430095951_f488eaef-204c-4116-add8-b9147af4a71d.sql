-- Tabella audit dei backup eseguiti (NON contiene il dump, solo metadati)
CREATE TABLE IF NOT EXISTS public.backup_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('minimal','standard','full')),
  triggered_by_user_id UUID,
  tables_included TEXT[] NOT NULL DEFAULT '{}',
  total_rows INTEGER NOT NULL DEFAULT 0,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  error TEXT,
  checksum TEXT,
  truncated_tables TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_backup_runs_brand_created ON public.backup_runs (brand_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backup_runs_status ON public.backup_runs (status) WHERE status = 'running';

ALTER TABLE public.backup_runs ENABLE ROW LEVEL SECURITY;

-- Solo admin/ceo possono leggere lo storico del proprio brand
CREATE POLICY "backup_runs_select_admin"
ON public.backup_runs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = public.get_user_id(auth.uid())
      AND ur.role IN ('admin','ceo')
      AND ur.is_active = true
      AND (ur.brand_id = backup_runs.brand_id OR ur.brand_id = '00000000-0000-0000-0000-000000000000'::uuid)
  )
);

-- Insert/update solo via service role (edge function)
CREATE POLICY "backup_runs_service_insert"
ON public.backup_runs
FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "backup_runs_service_update"
ON public.backup_runs
FOR UPDATE
TO service_role
USING (true);

-- RPC: verifica permessi per backup di un brand
CREATE OR REPLACE FUNCTION public.assert_can_backup_brand(p_brand_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_allowed BOOLEAN;
BEGIN
  v_user_id := public.get_user_id(auth.uid());
  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_user_id
      AND role IN ('admin','ceo')
      AND is_active = true
      AND (brand_id = p_brand_id OR brand_id = '00000000-0000-0000-0000-000000000000'::uuid)
  ) INTO v_allowed;
  RETURN COALESCE(v_allowed, FALSE);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assert_can_backup_brand(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.assert_can_backup_brand(UUID) TO authenticated;