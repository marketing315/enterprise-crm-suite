CREATE OR REPLACE FUNCTION public.enqueue_sheets_export_for_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.archived, false) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.sheets_export_logs (
    lead_event_id,
    brand_id,
    status,
    next_attempt_at,
    attempts
  )
  VALUES (
    NEW.id,
    NEW.brand_id,
    'pending',
    now(),
    0
  )
  ON CONFLICT (lead_event_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enqueue_sheets_export_for_lead ON public.lead_events;
CREATE TRIGGER trg_enqueue_sheets_export_for_lead
  AFTER INSERT ON public.lead_events
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_sheets_export_for_lead();

INSERT INTO public.sheets_export_logs (
  lead_event_id,
  brand_id,
  status,
  next_attempt_at,
  attempts
)
SELECT
  le.id,
  le.brand_id,
  'pending',
  now(),
  0
FROM public.lead_events le
WHERE le.received_at >= timestamp with time zone '2026-04-17 00:00:00+00'
  AND COALESCE(le.archived, false) = false
  AND NOT EXISTS (
    SELECT 1
    FROM public.sheets_export_logs sel
    WHERE sel.lead_event_id = le.id
  );