-- Recreate view with new column
CREATE VIEW webhook_sources_safe AS
SELECT id, brand_id, name, description, is_active, rate_limit_per_min,
       hmac_enabled, replay_window_seconds, counts_as_new_lead, created_at, updated_at
FROM webhook_sources;

GRANT SELECT ON webhook_sources_safe TO authenticated;

-- Update RPCs
CREATE OR REPLACE FUNCTION public.count_new_leads_in_range(p_brand_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone)
RETURNS bigint
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT count(DISTINCT le.contact_id)
  FROM lead_events le
  WHERE le.brand_id = ANY(p_brand_ids)
    AND le.contact_id IS NOT NULL
    AND le.received_at >= p_from
    AND le.received_at <= p_to
    AND NOT EXISTS (
      SELECT 1 FROM webhook_sources ws
      WHERE ws.name = le.source_name
        AND ws.brand_id = le.brand_id
        AND ws.counts_as_new_lead = false
    )
    AND NOT EXISTS (
      SELECT 1 FROM lead_events older
      WHERE older.contact_id = le.contact_id
        AND older.brand_id = le.brand_id
        AND older.received_at < p_from
        AND NOT EXISTS (
          SELECT 1 FROM webhook_sources ws2
          WHERE ws2.name = older.source_name
            AND ws2.brand_id = older.brand_id
            AND ws2.counts_as_new_lead = false
        )
    );
$function$;

CREATE OR REPLACE FUNCTION public.count_new_leads_by_day(p_brand_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone)
RETURNS TABLE(day date, new_leads bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH first_events AS (
    SELECT le.contact_id, (le.received_at AT TIME ZONE 'Europe/Rome')::date AS event_day
    FROM lead_events le
    WHERE le.brand_id = ANY(p_brand_ids)
      AND le.contact_id IS NOT NULL
      AND le.received_at >= p_from
      AND le.received_at <= p_to
      AND NOT EXISTS (
        SELECT 1 FROM webhook_sources ws
        WHERE ws.name = le.source_name
          AND ws.brand_id = le.brand_id
          AND ws.counts_as_new_lead = false
      )
      AND NOT EXISTS (
        SELECT 1 FROM lead_events older
        WHERE older.contact_id = le.contact_id
          AND older.brand_id = le.brand_id
          AND older.received_at < p_from
          AND NOT EXISTS (
            SELECT 1 FROM webhook_sources ws2
            WHERE ws2.name = older.source_name
              AND ws2.brand_id = older.brand_id
              AND ws2.counts_as_new_lead = false
          )
      )
  )
  SELECT fe.event_day AS day, count(DISTINCT fe.contact_id) AS new_leads
  FROM first_events fe
  GROUP BY fe.event_day
  ORDER BY fe.event_day;
$function$;
