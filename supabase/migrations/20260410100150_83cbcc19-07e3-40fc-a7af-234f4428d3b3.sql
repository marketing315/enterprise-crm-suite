
-- Add last_interaction_at column
ALTER TABLE public.contacts
ADD COLUMN last_interaction_at timestamptz;

-- Backfill from existing data
UPDATE public.contacts c
SET last_interaction_at = GREATEST(
  (SELECT MAX(received_at) FROM public.lead_events le WHERE le.contact_id = c.id),
  (SELECT MAX(started_at) FROM public.call_logs cl WHERE cl.contact_id = c.id),
  (SELECT MAX(scheduled_at) FROM public.appointments a WHERE a.contact_id = c.id)
);

-- Where no interactions exist, fall back to created_at
UPDATE public.contacts
SET last_interaction_at = created_at
WHERE last_interaction_at IS NULL;

-- Create index for sorting
CREATE INDEX idx_contacts_last_interaction_at ON public.contacts (last_interaction_at DESC);

-- Function to update last_interaction_at on contacts
CREATE OR REPLACE FUNCTION public.update_contact_last_interaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contact_id uuid;
  v_interaction_at timestamptz;
BEGIN
  -- Determine contact_id and interaction timestamp based on table
  IF TG_TABLE_NAME = 'lead_events' THEN
    v_contact_id := COALESCE(NEW.contact_id, OLD.contact_id);
    v_interaction_at := NEW.received_at;
  ELSIF TG_TABLE_NAME = 'call_logs' THEN
    v_contact_id := COALESCE(NEW.contact_id, OLD.contact_id);
    v_interaction_at := NEW.started_at;
  ELSIF TG_TABLE_NAME = 'appointments' THEN
    v_contact_id := COALESCE(NEW.contact_id, OLD.contact_id);
    v_interaction_at := NEW.scheduled_at;
  END IF;

  IF v_contact_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only update if this interaction is more recent
  UPDATE public.contacts
  SET last_interaction_at = v_interaction_at
  WHERE id = v_contact_id
    AND (last_interaction_at IS NULL OR last_interaction_at < v_interaction_at);

  RETURN NEW;
END;
$$;

-- Triggers on lead_events
CREATE TRIGGER trg_lead_events_update_last_interaction
AFTER INSERT OR UPDATE ON public.lead_events
FOR EACH ROW
EXECUTE FUNCTION public.update_contact_last_interaction();

-- Triggers on call_logs
CREATE TRIGGER trg_call_logs_update_last_interaction
AFTER INSERT OR UPDATE ON public.call_logs
FOR EACH ROW
EXECUTE FUNCTION public.update_contact_last_interaction();

-- Triggers on appointments
CREATE TRIGGER trg_appointments_update_last_interaction
AFTER INSERT OR UPDATE ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.update_contact_last_interaction();
