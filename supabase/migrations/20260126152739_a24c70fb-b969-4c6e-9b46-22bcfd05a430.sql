-- M8 Step B: Event Emission Triggers for Outbound Webhooks

-- 1) Trigger function: map ticket_audit_logs → webhook events
CREATE OR REPLACE FUNCTION public.emit_ticket_webhook_from_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_event_type webhook_event_type;
  v_payload jsonb;
  v_enqueued int;
BEGIN
  -- Map audit action_type to webhook event_type
  CASE NEW.action_type
    WHEN 'created' THEN v_event_type := 'ticket.created';
    WHEN 'status_change' THEN v_event_type := 'ticket.status_changed';
    WHEN 'assignment_change' THEN v_event_type := 'ticket.assigned';
    WHEN 'priority_change' THEN v_event_type := 'ticket.priority_changed';
    WHEN 'category_change' THEN v_event_type := 'ticket.updated';
    WHEN 'sla_breach' THEN v_event_type := 'ticket.sla_breached';
    ELSE 
      -- Ignore unmapped events (e.g., comment_added)
      RETURN NEW;
  END CASE;

  -- Build standardized payload (schema v1)
  v_payload := jsonb_build_object(
    'schema_version', 1,
    'event_type', v_event_type::text,
    'event_id', NEW.id,
    'occurred_at', NEW.created_at,
    'brand_id', NEW.brand_id,
    'ticket_id', NEW.ticket_id,
    'actor_user_id', NEW.user_id,
    'data', jsonb_build_object(
      'old', COALESCE(NEW.old_value, '{}'::jsonb),
      'new', COALESCE(NEW.new_value, '{}'::jsonb),
      'metadata', COALESCE(NEW.metadata, '{}'::jsonb)
    )
  );

  -- Enqueue to all matching webhooks (fan-out)
  SELECT enqueue_webhook_delivery(
    NEW.brand_id,
    v_event_type,
    NEW.id,  -- event_id = audit log id (idempotency key)
    v_payload
  ) INTO v_enqueued;

  RETURN NEW;
END;
$$;

-- 2) Trigger on ticket_audit_logs AFTER INSERT
DROP TRIGGER IF EXISTS trg_emit_ticket_webhook ON ticket_audit_logs;
CREATE TRIGGER trg_emit_ticket_webhook
  AFTER INSERT ON ticket_audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION emit_ticket_webhook_from_audit();

-- 3) Trigger function: create audit log on ticket INSERT (for ticket.created)
CREATE OR REPLACE FUNCTION public.audit_ticket_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Insert audit log entry for ticket creation
  -- This will trigger emit_ticket_webhook_from_audit via the audit trigger
  INSERT INTO ticket_audit_logs (
    brand_id,
    ticket_id,
    user_id,
    action_type,
    old_value,
    new_value,
    metadata
  ) VALUES (
    NEW.brand_id,
    NEW.id,
    NEW.assigned_by_user_id,  -- creator if available
    'created',
    NULL,  -- no old value for creation
    jsonb_build_object(
      'status', NEW.status,
      'priority', NEW.priority,
      'title', NEW.title,
      'description', LEFT(NEW.description, 500),  -- truncate for payload size
      'assigned_to_user_id', NEW.assigned_to_user_id,
      'category_tag_id', NEW.category_tag_id,
      'contact_id', NEW.contact_id,
      'deal_id', NEW.deal_id,
      'opened_at', NEW.opened_at
    ),
    jsonb_build_object(
      'created_by', NEW.created_by,
      'source_event_id', NEW.source_event_id
    )
  );

  RETURN NEW;
END;
$$;

-- 4) Trigger on tickets AFTER INSERT
DROP TRIGGER IF EXISTS trg_audit_ticket_created ON tickets;
CREATE TRIGGER trg_audit_ticket_created
  AFTER INSERT ON tickets
  FOR EACH ROW
  EXECUTE FUNCTION audit_ticket_created();

-- 5) Add webhook event types for resolved/closed if not present
-- (These map from status_change but may want specific events)
-- The status_change handler emits ticket.status_changed which covers all status transitions

-- 6) Create indexes for efficient delivery claiming
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_pending 
  ON outbound_webhook_deliveries (next_attempt_at, status) 
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_brand_status
  ON outbound_webhook_deliveries (brand_id, status, created_at DESC);