-- Funzione SECURITY DEFINER per controllare conflitti appuntamenti
-- Restituisce appuntamenti dello stesso sales user che si sovrappongono con la finestra richiesta
CREATE OR REPLACE FUNCTION public.check_appointment_conflict(
  p_brand_id uuid,
  p_assigned_sales_user_id uuid,
  p_scheduled_at timestamptz,
  p_duration_minutes integer,
  p_exclude_appointment_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  scheduled_at timestamptz,
  duration_minutes integer,
  contact_id uuid,
  status appointment_status
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.id,
    a.scheduled_at,
    a.duration_minutes,
    a.contact_id,
    a.status
  FROM public.appointments a
  WHERE a.brand_id = p_brand_id
    AND a.assigned_sales_user_id = p_assigned_sales_user_id
    AND p_assigned_sales_user_id IS NOT NULL
    AND a.status NOT IN ('cancelled', 'no_show', 'completed')
    AND (p_exclude_appointment_id IS NULL OR a.id <> p_exclude_appointment_id)
    AND tstzrange(a.scheduled_at, a.scheduled_at + (a.duration_minutes || ' minutes')::interval, '[)')
        && tstzrange(p_scheduled_at, p_scheduled_at + (p_duration_minutes || ' minutes')::interval, '[)')
  ORDER BY a.scheduled_at
  LIMIT 50;
$$;

COMMENT ON FUNCTION public.check_appointment_conflict IS
  'Phase 1 Block 3: Read-only conflict detection for calendar drag&drop and new appointment dialog. Excludes cancelled/no_show/completed and ignores rows when assigned user is null.';