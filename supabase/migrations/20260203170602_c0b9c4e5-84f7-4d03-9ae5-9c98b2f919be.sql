
-- Fix: Add booking_notes, logistics_notes, raw_payload and received_at to event_snapshot
CREATE OR REPLACE FUNCTION public.emit_lead_event_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_payload JSONB;
  v_event_snapshot JSONB;
BEGIN
  -- Build event snapshot with ALL relevant fields
  v_event_snapshot := jsonb_build_object(
    'id', NEW.id,
    'source', NEW.source,
    'source_name', NEW.source_name,
    'occurred_at', NEW.occurred_at,
    'received_at', NEW.received_at,
    'ai_priority', NEW.ai_priority,
    'lead_type', NEW.lead_type,
    'lead_source_channel', NEW.lead_source_channel,
    'contact_channel', NEW.contact_channel,
    'pacemaker_status', NEW.pacemaker_status,
    'customer_sentiment', NEW.customer_sentiment,
    'decision_status', NEW.decision_status,
    'objection_type', NEW.objection_type,
    'booking_notes', NEW.booking_notes,
    'logistics_notes', NEW.logistics_notes,
    'ai_conversation_summary', NEW.ai_conversation_summary,
    'raw_payload', NEW.raw_payload,
    'archived', NEW.archived
  );
  
  -- Build v1 payload
  v_payload := build_webhook_payload_v1(
    p_event_type := 'lead_event.created',
    p_brand_id := NEW.brand_id,
    p_event_id := NEW.id,
    p_occurred_at := NEW.occurred_at,
    p_refs := jsonb_build_object(
      'lead_event_id', NEW.id,
      'contact_id', NEW.contact_id,
      'deal_id', NEW.deal_id
    ),
    p_contact_id := NEW.contact_id,
    p_deal_id := NEW.deal_id,
    p_lead_event_id := NEW.id,
    p_event_snapshot := v_event_snapshot
  );
  
  -- Enqueue delivery
  PERFORM enqueue_webhook_delivery(
    NEW.brand_id,
    'lead_event.created'::webhook_event_type,
    NEW.id,
    v_payload
  );
  
  RETURN NEW;
END;
$$;

-- Also add notes to contact_snapshot
CREATE OR REPLACE FUNCTION public.build_contact_snapshot(p_contact_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = 'public'
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'id', c.id,
    'first_name', c.first_name,
    'last_name', c.last_name,
    'email', c.email,
    'address', c.address,
    'city', c.city,
    'cap', c.cap,
    'status', c.status,
    'notes', c.notes,
    'primary_phone', (
      SELECT cp.phone_normalized 
      FROM contact_phones cp 
      WHERE cp.contact_id = c.id AND cp.is_primary = true 
      LIMIT 1
    )
  )
  INTO v_result
  FROM contacts c
  WHERE c.id = p_contact_id;
  
  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;
