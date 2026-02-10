
-- RPC to list CAPI events with brand/period filtering
CREATE OR REPLACE FUNCTION public.list_capi_events(
  p_brand_ids uuid[],
  p_from timestamptz DEFAULT now() - interval '7 days',
  p_to timestamptz DEFAULT now(),
  p_status text DEFAULT NULL,
  p_event_name text DEFAULT NULL,
  p_limit int DEFAULT 200
)
RETURNS TABLE (
  id uuid,
  brand_id uuid,
  event_name text,
  event_id text,
  event_time timestamptz,
  contact_id uuid,
  deal_id uuid,
  lead_event_id uuid,
  consent_snapshot boolean,
  status text,
  attempts int,
  max_attempts int,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz,
  contact_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    q.id,
    q.brand_id,
    q.event_name,
    q.event_id,
    q.event_time,
    q.contact_id,
    q.deal_id,
    q.lead_event_id,
    q.consent_snapshot,
    q.status::text,
    q.attempts,
    q.max_attempts,
    q.last_error,
    q.sent_at,
    q.created_at,
    COALESCE(c.first_name || ' ' || c.last_name, c.first_name, c.last_name, 'N/A') AS contact_name
  FROM meta_capi_event_queue q
  LEFT JOIN contacts c ON c.id = q.contact_id
  WHERE q.brand_id = ANY(p_brand_ids)
    AND q.created_at >= p_from
    AND q.created_at <= p_to
    AND (p_status IS NULL OR q.status::text = p_status)
    AND (p_event_name IS NULL OR q.event_name = p_event_name)
  ORDER BY q.created_at DESC
  LIMIT p_limit;
$$;

-- RPC for CAPI summary KPIs
CREATE OR REPLACE FUNCTION public.capi_events_summary(
  p_brand_ids uuid[],
  p_from timestamptz DEFAULT now() - interval '7 days',
  p_to timestamptz DEFAULT now()
)
RETURNS TABLE (
  total_events bigint,
  pending_count bigint,
  sent_count bigint,
  failed_count bigint,
  skipped_count bigint,
  processing_count bigint,
  avg_attempts numeric,
  lead_events bigint,
  purchase_events bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(*)::bigint AS total_events,
    COUNT(*) FILTER (WHERE status::text = 'pending')::bigint AS pending_count,
    COUNT(*) FILTER (WHERE status::text = 'sent')::bigint AS sent_count,
    COUNT(*) FILTER (WHERE status::text = 'failed')::bigint AS failed_count,
    COUNT(*) FILTER (WHERE status::text = 'skipped')::bigint AS skipped_count,
    COUNT(*) FILTER (WHERE status::text = 'processing')::bigint AS processing_count,
    ROUND(AVG(attempts)::numeric, 1) AS avg_attempts,
    COUNT(*) FILTER (WHERE event_name = 'Lead')::bigint AS lead_events,
    COUNT(*) FILTER (WHERE event_name = 'Purchase')::bigint AS purchase_events
  FROM meta_capi_event_queue
  WHERE brand_id = ANY(p_brand_ids)
    AND created_at >= p_from
    AND created_at <= p_to;
$$;
