
-- A9 extension: deals + automation_jobs

-- 1) deals CHECK (data already clean: 0 violations verified)
ALTER TABLE public.deals
  ADD CONSTRAINT deals_value_non_negative_chk
  CHECK (value IS NULL OR value >= 0);

ALTER TABLE public.deals
  ADD CONSTRAINT deals_closed_after_created_chk
  CHECK (closed_at IS NULL OR closed_at >= created_at);

-- 2) automation_jobs idempotency_key (nullable additive) + partial unique
ALTER TABLE public.automation_jobs
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS ux_automation_jobs_brand_type_idem
  ON public.automation_jobs (brand_id, job_type, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON COLUMN public.automation_jobs.idempotency_key IS
  'A9: optional dedup key. When set, (brand_id, job_type, idempotency_key) is UNIQUE. Legacy rows with NULL are not constrained.';
