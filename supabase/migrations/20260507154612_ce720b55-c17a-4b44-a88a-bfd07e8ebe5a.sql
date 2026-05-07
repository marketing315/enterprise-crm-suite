CREATE TABLE IF NOT EXISTS public.db_size_history (
  id bigserial PRIMARY KEY,
  measured_at timestamptz NOT NULL DEFAULT now(),
  total_bytes bigint NOT NULL,
  top_tables jsonb NOT NULL
);

ALTER TABLE public.db_size_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "db_size_history_admin_read" ON public.db_size_history;
CREATE POLICY "db_size_history_admin_read"
  ON public.db_size_history FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'ceo'::public.app_role));

CREATE INDEX IF NOT EXISTS idx_db_size_history_measured_at
  ON public.db_size_history (measured_at DESC);