-- Punto 2: Audit dei restore

CREATE TABLE IF NOT EXISTS public.restore_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  triggered_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  source_filename text,
  source_checksum text,
  source_run_id text,
  source_brand_id uuid,
  source_scope text,
  mode text NOT NULL DEFAULT 'dry_run', -- dry_run | apply
  conflict_strategy text NOT NULL DEFAULT 'skip', -- skip | overwrite (apply only)
  tables_selected text[] NOT NULL DEFAULT '{}',
  tables_summary jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_rows_in_archive integer NOT NULL DEFAULT 0,
  total_rows_inserted integer NOT NULL DEFAULT 0,
  total_rows_skipped integer NOT NULL DEFAULT 0,
  duration_ms integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'running', -- running | completed | failed
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_restore_runs_brand_created
  ON public.restore_runs (brand_id, created_at DESC);

ALTER TABLE public.restore_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "restore_runs_select_admins"
ON public.restore_runs FOR SELECT
TO authenticated
USING (
  has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role)
  OR has_role(get_user_id(auth.uid()), 'ceo'::app_role)
);

-- Insert/update: solo service_role (la edge function service_role)
CREATE POLICY "restore_runs_insert_service"
ON public.restore_runs FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "restore_runs_update_service"
ON public.restore_runs FOR UPDATE
TO service_role
USING (true);

-- Funzione di check
CREATE OR REPLACE FUNCTION public.assert_can_restore_brand(p_brand_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := public.get_user_id(auth.uid());
  IF v_user_id IS NULL THEN RETURN FALSE; END IF;
  RETURN public.has_role_for_brand(v_user_id, p_brand_id, 'admin'::app_role)
      OR public.has_role(v_user_id, 'ceo'::app_role);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assert_can_restore_brand(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.assert_can_restore_brand(uuid) TO authenticated;
