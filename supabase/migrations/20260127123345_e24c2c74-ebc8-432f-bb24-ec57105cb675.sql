-- M8 Step D2: Retention policy for outbound_webhook_deliveries (7 days)

-- 1. Index for efficient cleanup queries
CREATE INDEX IF NOT EXISTS idx_outbound_webhook_deliveries_created_at
  ON public.outbound_webhook_deliveries (created_at);

-- 2. Cleanup function with chunked deletion (avoids long locks)
CREATE OR REPLACE FUNCTION public.cleanup_outbound_webhook_deliveries(p_limit int DEFAULT 10000)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted int := 0;
BEGIN
  WITH doomed AS (
    SELECT id
    FROM public.outbound_webhook_deliveries
    WHERE created_at < now() - interval '7 days'
    ORDER BY created_at ASC
    LIMIT p_limit
  )
  DELETE FROM public.outbound_webhook_deliveries d
  USING doomed
  WHERE d.id = doomed.id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- 3. Revoke public access (only service role / backend can call)
REVOKE ALL ON FUNCTION public.cleanup_outbound_webhook_deliveries(int) FROM PUBLIC;