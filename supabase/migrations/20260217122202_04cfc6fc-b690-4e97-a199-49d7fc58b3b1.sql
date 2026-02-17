-- B07 FIX: Atomic job claim function to prevent duplicate dispatch
CREATE OR REPLACE FUNCTION public.claim_automation_jobs(p_limit integer DEFAULT 50)
RETURNS SETOF automation_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE automation_jobs
  SET status = 'running', updated_at = now()
  WHERE id IN (
    SELECT id FROM automation_jobs
    WHERE status = 'scheduled'
      AND run_at <= now()
    ORDER BY run_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;