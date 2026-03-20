
CREATE OR REPLACE FUNCTION public.count_new_leads_by_day(
  p_brand_ids uuid[],
  p_from timestamptz,
  p_to timestamptz
)
RETURNS TABLE(day date, new_leads bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- For each day in the range, count contacts whose first-ever lead_event is on that day.
  WITH first_events AS (
    SELECT le.contact_id, (le.received_at AT TIME ZONE 'Europe/Rome')::date AS event_day
    FROM lead_events le
    WHERE le.brand_id = ANY(p_brand_ids)
      AND le.contact_id IS NOT NULL
      AND le.received_at >= p_from
      AND le.received_at <= p_to
      AND NOT EXISTS (
        SELECT 1 FROM lead_events older
        WHERE older.contact_id = le.contact_id
          AND older.brand_id = le.brand_id
          AND older.received_at < p_from
      )
  )
  SELECT fe.event_day AS day, count(DISTINCT fe.contact_id) AS new_leads
  FROM first_events fe
  GROUP BY fe.event_day
  ORDER BY fe.event_day;
$$;
