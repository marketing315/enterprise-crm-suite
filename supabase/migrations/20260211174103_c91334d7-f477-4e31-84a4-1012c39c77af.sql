
-- Fix max_attempts: set NOT NULL with default to prevent starvation edge case
ALTER TABLE public.meta_capi_event_queue 
  ALTER COLUMN max_attempts SET NOT NULL,
  ALTER COLUMN max_attempts SET DEFAULT 3;

ALTER TABLE public.meta_capi_event_queue 
  ALTER COLUMN attempts SET NOT NULL,
  ALTER COLUMN attempts SET DEFAULT 0;

-- Backfill any NULLs that may exist
UPDATE public.meta_capi_event_queue SET max_attempts = 3 WHERE max_attempts IS NULL;
UPDATE public.meta_capi_event_queue SET attempts = 0 WHERE attempts IS NULL;
