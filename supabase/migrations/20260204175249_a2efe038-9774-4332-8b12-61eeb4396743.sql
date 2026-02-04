-- RPC to claim pending inbound events for processing (FOR UPDATE SKIP LOCKED)
CREATE OR REPLACE FUNCTION public.claim_inbound_events(p_limit int DEFAULT 50)
RETURNS SETOF public.webhook_inbound_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.webhook_inbound_events
  SET status = 'processing'
  WHERE id IN (
    SELECT id FROM public.webhook_inbound_events
    WHERE status = 'pending'
      AND (attempts < 5 OR attempts IS NULL)
    ORDER BY received_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

-- Grant execute to service role only
REVOKE ALL ON FUNCTION public.claim_inbound_events FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_inbound_events TO service_role;