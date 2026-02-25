
-- Function to create notifications for all active users of a brand
CREATE OR REPLACE FUNCTION public.create_brand_notifications(
  p_brand_id uuid,
  p_type notification_type,
  p_title text,
  p_body text DEFAULT NULL,
  p_entity_type text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL,
  p_exclude_user_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO notifications (brand_id, user_id, type, title, body, entity_type, entity_id)
  SELECT p_brand_id, ur.user_id, p_type, p_title, p_body, p_entity_type, p_entity_id
  FROM user_roles ur
  WHERE ur.brand_id = p_brand_id
    AND ur.is_active = true
    AND (p_exclude_user_id IS NULL OR ur.user_id != p_exclude_user_id);
END;
$$;

-- Trigger: new lead event → notification
CREATE OR REPLACE FUNCTION public.trg_notify_lead_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contact_name text;
BEGIN
  SELECT COALESCE(first_name || ' ' || last_name, first_name, email, 'Contatto')
  INTO v_contact_name
  FROM contacts WHERE id = NEW.contact_id;

  PERFORM create_brand_notifications(
    NEW.brand_id,
    'lead_event_created',
    'Nuovo Lead: ' || COALESCE(v_contact_name, 'Sconosciuto'),
    COALESCE(NEW.source_name, 'webhook'),
    'lead_event',
    NEW.id
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_lead_event_notify
AFTER INSERT ON lead_events
FOR EACH ROW
EXECUTE FUNCTION trg_notify_lead_event();

-- Trigger: new ticket → notification
CREATE OR REPLACE FUNCTION public.trg_notify_ticket_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM create_brand_notifications(
    NEW.brand_id,
    'ticket_created',
    'Nuovo Ticket: ' || COALESCE(NEW.subject, 'Senza oggetto'),
    'Priorità: ' || COALESCE(NEW.priority, 'P3'),
    'ticket',
    NEW.id
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ticket_created_notify
AFTER INSERT ON tickets
FOR EACH ROW
EXECUTE FUNCTION trg_notify_ticket_created();

-- Trigger: ticket assigned → notification to assigned user only
CREATE OR REPLACE FUNCTION public.trg_notify_ticket_assigned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL AND (OLD.assigned_to IS DISTINCT FROM NEW.assigned_to) THEN
    INSERT INTO notifications (brand_id, user_id, type, title, body, entity_type, entity_id)
    VALUES (
      NEW.brand_id,
      NEW.assigned_to,
      'ticket_assigned',
      'Ticket assegnato a te: ' || COALESCE(NEW.subject, 'Senza oggetto'),
      'Priorità: ' || COALESCE(NEW.priority, 'P3'),
      'ticket',
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ticket_assigned_notify
AFTER UPDATE ON tickets
FOR EACH ROW
EXECUTE FUNCTION trg_notify_ticket_assigned();

-- Trigger: deal stage changed → notification
CREATE OR REPLACE FUNCTION public.trg_notify_deal_stage_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stage_name text;
  v_contact_name text;
BEGIN
  IF OLD.stage_id IS DISTINCT FROM NEW.stage_id THEN
    SELECT name INTO v_stage_name FROM pipeline_stages WHERE id = NEW.stage_id;
    SELECT COALESCE(first_name || ' ' || last_name, first_name, email, 'Contatto')
    INTO v_contact_name FROM contacts WHERE id = NEW.contact_id;

    PERFORM create_brand_notifications(
      NEW.brand_id,
      'pipeline_stage_changed',
      'Deal spostato: ' || COALESCE(v_contact_name, 'N/A'),
      'Nuovo stage: ' || COALESCE(v_stage_name, 'N/A'),
      'deal',
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_deal_stage_changed_notify
AFTER UPDATE ON deals
FOR EACH ROW
EXECUTE FUNCTION trg_notify_deal_stage_changed();

-- Trigger: appointment created → notification
CREATE OR REPLACE FUNCTION public.trg_notify_appointment_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contact_name text;
BEGIN
  SELECT COALESCE(first_name || ' ' || last_name, first_name, 'Contatto')
  INTO v_contact_name FROM contacts WHERE id = NEW.contact_id;

  PERFORM create_brand_notifications(
    NEW.brand_id,
    'appointment_created',
    'Nuovo Appuntamento: ' || COALESCE(v_contact_name, 'N/A'),
    to_char(NEW.scheduled_at AT TIME ZONE 'Europe/Rome', 'DD/MM/YYYY HH24:MI'),
    'appointment',
    NEW.id
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_appointment_created_notify
AFTER INSERT ON appointments
FOR EACH ROW
EXECUTE FUNCTION trg_notify_appointment_created();
