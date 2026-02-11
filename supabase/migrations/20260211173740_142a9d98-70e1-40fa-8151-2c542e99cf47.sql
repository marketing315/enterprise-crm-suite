
-- Mark events stuck in 'processing' that have exhausted retries as 'failed' (anti-starvation DLQ)
CREATE OR REPLACE FUNCTION public.reclaim_stale_capi_events()
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  affected integer;
BEGIN
  -- Events stuck in 'processing' for >5 min AND exhausted max_attempts → mark as failed
  UPDATE public.meta_capi_event_queue
  SET 
    status = 'failed',
    last_error = 'Exhausted max_attempts while stuck in processing (auto-DLQ)',
    processing_at = NULL,
    processing_by = NULL
  WHERE status = 'processing'
    AND processing_at < NOW() - INTERVAL '5 minutes'
    AND attempts >= max_attempts;
  
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;
