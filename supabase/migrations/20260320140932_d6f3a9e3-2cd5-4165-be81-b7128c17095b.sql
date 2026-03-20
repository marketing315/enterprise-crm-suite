
CREATE OR REPLACE FUNCTION public.count_new_leads_in_range(
  p_brand_ids uuid[],
  p_from timestamptz,
  p_to timestamptz
)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Count contacts whose FIRST-EVER lead_event falls within [p_from, p_to].
  -- This excludes "update" events for contacts that already existed before the range.
  SELECT count(DISTINCT le.contact_id)
  FROM lead_events le
  WHERE le.brand_id = ANY(p_brand_ids)
    AND le.contact_id IS NOT NULL
    AND le.received_at >= p_from
    AND le.received_at <= p_to
    AND NOT EXISTS (
      SELECT 1
      FROM lead_events older
      WHERE older.contact_id = le.contact_id
        AND older.brand_id = le.brand_id
        AND older.received_at < p_from
    );
$$;
