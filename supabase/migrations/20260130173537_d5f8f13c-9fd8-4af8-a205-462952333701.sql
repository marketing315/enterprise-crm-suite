-- M8 PRD: Complete Event Types + Versioned Payload System
-- 1) Add new event types to enum (PRD-aligned naming)
ALTER TYPE webhook_event_type ADD VALUE IF NOT EXISTS 'lead_event.created';
ALTER TYPE webhook_event_type ADD VALUE IF NOT EXISTS 'pipeline.stage_changed';
ALTER TYPE webhook_event_type ADD VALUE IF NOT EXISTS 'tags.updated';
ALTER TYPE webhook_event_type ADD VALUE IF NOT EXISTS 'appointment.created';
ALTER TYPE webhook_event_type ADD VALUE IF NOT EXISTS 'appointment.updated';
ALTER TYPE webhook_event_type ADD VALUE IF NOT EXISTS 'sale.recorded';

-- 2) Helper function: build contact snapshot
CREATE OR REPLACE FUNCTION public.build_contact_snapshot(p_contact_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'id', c.id,
    'first_name', c.first_name,
    'last_name', c.last_name,
    'email', c.email,
    'city', c.city,
    'cap', c.cap,
    'status', c.status,
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

-- 3) Helper function: build deal snapshot
CREATE OR REPLACE FUNCTION public.build_deal_snapshot(p_deal_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF p_deal_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'id', d.id,
    'status', d.status,
    'value', d.value,
    'current_stage_id', d.current_stage_id,
    'current_stage_name', ps.name
  )
  INTO v_result
  FROM deals d
  LEFT JOIN pipeline_stages ps ON ps.id = d.current_stage_id
  WHERE d.id = p_deal_id;
  
  RETURN v_result;
END;
$$;

-- 4) Helper function: build tags array for entity
CREATE OR REPLACE FUNCTION public.build_entity_tags(
  p_brand_id UUID,
  p_contact_id UUID DEFAULT NULL,
  p_deal_id UUID DEFAULT NULL,
  p_lead_event_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql STABLE
AS $$
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', t.id,
      'name', t.name,
      'color', t.color,
      'scope', t.scope
    ))
    FROM tag_assignments ta
    JOIN tags t ON t.id = ta.tag_id
    WHERE ta.brand_id = p_brand_id
      AND (
        (p_contact_id IS NOT NULL AND ta.contact_id = p_contact_id) OR
        (p_deal_id IS NOT NULL AND ta.deal_id = p_deal_id) OR
        (p_lead_event_id IS NOT NULL AND ta.lead_event_id = p_lead_event_id)
      )
  ), '[]'::jsonb);
END;
$$;

-- 5) Main payload builder: versioned v1 format
CREATE OR REPLACE FUNCTION public.build_webhook_payload_v1(
  p_event_type TEXT,
  p_brand_id UUID,
  p_event_id UUID,
  p_occurred_at TIMESTAMPTZ,
  p_refs JSONB DEFAULT '{}'::jsonb,
  p_contact_id UUID DEFAULT NULL,
  p_deal_id UUID DEFAULT NULL,
  p_lead_event_id UUID DEFAULT NULL,
  p_event_snapshot JSONB DEFAULT NULL,
  p_appointment_snapshot JSONB DEFAULT NULL,
  p_sale_snapshot JSONB DEFAULT NULL,
  p_stage_snapshot JSONB DEFAULT NULL,
  p_old_data JSONB DEFAULT NULL,
  p_new_data JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_payload JSONB;
BEGIN
  v_payload := jsonb_build_object(
    'version', 'v1',
    'type', p_event_type,
    'occurred_at', p_occurred_at,
    'brand_id', p_brand_id,
    'event_id', p_event_id,
    'refs', p_refs
  );
  
  -- Add contact_snapshot if contact_id provided
  IF p_contact_id IS NOT NULL THEN
    v_payload := v_payload || jsonb_build_object(
      'contact_snapshot', build_contact_snapshot(p_contact_id)
    );
  END IF;
  
  -- Add deal_snapshot if deal_id provided
  IF p_deal_id IS NOT NULL THEN
    v_payload := v_payload || jsonb_build_object(
      'deal_snapshot', build_deal_snapshot(p_deal_id)
    );
  END IF;
  
  -- Add tags
  v_payload := v_payload || jsonb_build_object(
    'tags', build_entity_tags(p_brand_id, p_contact_id, p_deal_id, p_lead_event_id)
  );
  
  -- Add optional snapshots
  IF p_event_snapshot IS NOT NULL THEN
    v_payload := v_payload || jsonb_build_object('event_snapshot', p_event_snapshot);
  END IF;
  
  IF p_appointment_snapshot IS NOT NULL THEN
    v_payload := v_payload || jsonb_build_object('appointment', p_appointment_snapshot);
  END IF;
  
  IF p_sale_snapshot IS NOT NULL THEN
    v_payload := v_payload || jsonb_build_object('sale', p_sale_snapshot);
  END IF;
  
  IF p_stage_snapshot IS NOT NULL THEN
    v_payload := v_payload || jsonb_build_object('stage', p_stage_snapshot);
  END IF;
  
  -- Add change tracking
  IF p_old_data IS NOT NULL OR p_new_data IS NOT NULL THEN
    v_payload := v_payload || jsonb_build_object(
      'changes', jsonb_build_object(
        'old', COALESCE(p_old_data, '{}'::jsonb),
        'new', COALESCE(p_new_data, '{}'::jsonb)
      )
    );
  END IF;
  
  RETURN v_payload;
END;
$$;

-- 6) Trigger: lead_event.created
CREATE OR REPLACE FUNCTION public.emit_lead_event_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payload JSONB;
  v_event_snapshot JSONB;
BEGIN
  -- Build event snapshot
  v_event_snapshot := jsonb_build_object(
    'id', NEW.id,
    'source', NEW.source,
    'source_name', NEW.source_name,
    'occurred_at', NEW.occurred_at,
    'ai_priority', NEW.ai_priority,
    'lead_type', NEW.lead_type,
    'lead_source_channel', NEW.lead_source_channel,
    'contact_channel', NEW.contact_channel,
    'pacemaker_status', NEW.pacemaker_status,
    'customer_sentiment', NEW.customer_sentiment,
    'decision_status', NEW.decision_status,
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

DROP TRIGGER IF EXISTS trg_emit_lead_event_created ON lead_events;
CREATE TRIGGER trg_emit_lead_event_created
  AFTER INSERT ON lead_events
  FOR EACH ROW
  EXECUTE FUNCTION emit_lead_event_created();

-- 7) Trigger: pipeline.stage_changed (from deal_stage_history)
CREATE OR REPLACE FUNCTION public.emit_pipeline_stage_changed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deal deals%ROWTYPE;
  v_from_stage pipeline_stages%ROWTYPE;
  v_to_stage pipeline_stages%ROWTYPE;
  v_payload JSONB;
  v_stage_snapshot JSONB;
BEGIN
  -- Get deal info
  SELECT * INTO v_deal FROM deals WHERE id = NEW.deal_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;
  
  -- Get stage names
  IF NEW.from_stage_id IS NOT NULL THEN
    SELECT * INTO v_from_stage FROM pipeline_stages WHERE id = NEW.from_stage_id;
  END IF;
  SELECT * INTO v_to_stage FROM pipeline_stages WHERE id = NEW.to_stage_id;
  
  v_stage_snapshot := jsonb_build_object(
    'from_stage_id', NEW.from_stage_id,
    'from_stage_name', v_from_stage.name,
    'to_stage_id', NEW.to_stage_id,
    'to_stage_name', v_to_stage.name,
    'changed_by_user_id', NEW.changed_by,
    'changed_at', NEW.changed_at,
    'notes', NEW.notes
  );
  
  v_payload := build_webhook_payload_v1(
    p_event_type := 'pipeline.stage_changed',
    p_brand_id := v_deal.brand_id,
    p_event_id := NEW.id,
    p_occurred_at := NEW.changed_at,
    p_refs := jsonb_build_object(
      'deal_id', NEW.deal_id,
      'contact_id', v_deal.contact_id,
      'history_id', NEW.id
    ),
    p_contact_id := v_deal.contact_id,
    p_deal_id := NEW.deal_id,
    p_stage_snapshot := v_stage_snapshot
  );
  
  PERFORM enqueue_webhook_delivery(
    v_deal.brand_id,
    'pipeline.stage_changed'::webhook_event_type,
    NEW.id,
    v_payload
  );
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_emit_pipeline_stage_changed ON deal_stage_history;
CREATE TRIGGER trg_emit_pipeline_stage_changed
  AFTER INSERT ON deal_stage_history
  FOR EACH ROW
  EXECUTE FUNCTION emit_pipeline_stage_changed();

-- 8) Trigger: tags.updated
CREATE OR REPLACE FUNCTION public.emit_tags_updated()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payload JSONB;
  v_entity_type TEXT;
  v_entity_id UUID;
  v_contact_id UUID;
  v_deal_id UUID;
BEGIN
  -- Determine entity type and ID
  IF TG_OP = 'DELETE' THEN
    v_entity_id := COALESCE(OLD.contact_id, OLD.deal_id, OLD.lead_event_id);
    v_contact_id := OLD.contact_id;
    v_deal_id := OLD.deal_id;
    
    IF OLD.contact_id IS NOT NULL THEN v_entity_type := 'contact';
    ELSIF OLD.deal_id IS NOT NULL THEN v_entity_type := 'deal';
    ELSIF OLD.lead_event_id IS NOT NULL THEN v_entity_type := 'lead_event';
    END IF;
    
    v_payload := build_webhook_payload_v1(
      p_event_type := 'tags.updated',
      p_brand_id := OLD.brand_id,
      p_event_id := OLD.id,
      p_occurred_at := now(),
      p_refs := jsonb_build_object(
        'entity_type', v_entity_type,
        'entity_id', v_entity_id,
        'tag_id', OLD.tag_id,
        'action', 'removed'
      ),
      p_contact_id := v_contact_id,
      p_deal_id := v_deal_id
    );
    
    PERFORM enqueue_webhook_delivery(
      OLD.brand_id,
      'tags.updated'::webhook_event_type,
      OLD.id,
      v_payload
    );
    
    RETURN OLD;
  ELSE
    v_entity_id := COALESCE(NEW.contact_id, NEW.deal_id, NEW.lead_event_id);
    v_contact_id := NEW.contact_id;
    v_deal_id := NEW.deal_id;
    
    IF NEW.contact_id IS NOT NULL THEN v_entity_type := 'contact';
    ELSIF NEW.deal_id IS NOT NULL THEN v_entity_type := 'deal';
    ELSIF NEW.lead_event_id IS NOT NULL THEN v_entity_type := 'lead_event';
    END IF;
    
    v_payload := build_webhook_payload_v1(
      p_event_type := 'tags.updated',
      p_brand_id := NEW.brand_id,
      p_event_id := NEW.id,
      p_occurred_at := NEW.assigned_at,
      p_refs := jsonb_build_object(
        'entity_type', v_entity_type,
        'entity_id', v_entity_id,
        'tag_id', NEW.tag_id,
        'action', 'added'
      ),
      p_contact_id := v_contact_id,
      p_deal_id := v_deal_id
    );
    
    PERFORM enqueue_webhook_delivery(
      NEW.brand_id,
      'tags.updated'::webhook_event_type,
      NEW.id,
      v_payload
    );
    
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_emit_tags_updated ON tag_assignments;
CREATE TRIGGER trg_emit_tags_updated
  AFTER INSERT OR DELETE ON tag_assignments
  FOR EACH ROW
  EXECUTE FUNCTION emit_tags_updated();

-- 9) Trigger: appointment.created / appointment.updated
CREATE OR REPLACE FUNCTION public.emit_appointment_webhook()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payload JSONB;
  v_event_type TEXT;
  v_appointment_snapshot JSONB;
  v_sales_user_name TEXT;
BEGIN
  -- Get sales user name
  IF NEW.assigned_sales_user_id IS NOT NULL THEN
    SELECT full_name INTO v_sales_user_name FROM users WHERE id = NEW.assigned_sales_user_id;
  END IF;
  
  v_appointment_snapshot := jsonb_build_object(
    'id', NEW.id,
    'scheduled_at', NEW.scheduled_at,
    'duration_minutes', NEW.duration_minutes,
    'status', NEW.status,
    'appointment_type', NEW.appointment_type,
    'appointment_order', NEW.appointment_order,
    'address', NEW.address,
    'city', NEW.city,
    'cap', NEW.cap,
    'notes', NEW.notes,
    'assigned_sales_user_id', NEW.assigned_sales_user_id,
    'assigned_sales_user_name', v_sales_user_name,
    'parent_appointment_id', NEW.parent_appointment_id
  );
  
  IF TG_OP = 'INSERT' THEN
    v_event_type := 'appointment.created';
  ELSE
    v_event_type := 'appointment.updated';
  END IF;
  
  v_payload := build_webhook_payload_v1(
    p_event_type := v_event_type,
    p_brand_id := NEW.brand_id,
    p_event_id := NEW.id,
    p_occurred_at := CASE WHEN TG_OP = 'INSERT' THEN NEW.created_at ELSE NEW.updated_at END,
    p_refs := jsonb_build_object(
      'appointment_id', NEW.id,
      'contact_id', NEW.contact_id,
      'deal_id', NEW.deal_id
    ),
    p_contact_id := NEW.contact_id,
    p_deal_id := NEW.deal_id,
    p_appointment_snapshot := v_appointment_snapshot,
    p_old_data := CASE WHEN TG_OP = 'UPDATE' THEN jsonb_build_object(
      'status', OLD.status,
      'scheduled_at', OLD.scheduled_at,
      'assigned_sales_user_id', OLD.assigned_sales_user_id
    ) ELSE NULL END,
    p_new_data := CASE WHEN TG_OP = 'UPDATE' THEN jsonb_build_object(
      'status', NEW.status,
      'scheduled_at', NEW.scheduled_at,
      'assigned_sales_user_id', NEW.assigned_sales_user_id
    ) ELSE NULL END
  );
  
  PERFORM enqueue_webhook_delivery(
    NEW.brand_id,
    v_event_type::webhook_event_type,
    NEW.id,
    v_payload
  );
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_emit_appointment_created ON appointments;
DROP TRIGGER IF EXISTS trg_emit_appointment_updated ON appointments;

CREATE TRIGGER trg_emit_appointment_created
  AFTER INSERT ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION emit_appointment_webhook();

CREATE TRIGGER trg_emit_appointment_updated
  AFTER UPDATE ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION emit_appointment_webhook();

-- 10) Trigger: sale.recorded (when deal status changes to 'won')
CREATE OR REPLACE FUNCTION public.emit_sale_recorded()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payload JSONB;
  v_sale_snapshot JSONB;
  v_stage_name TEXT;
BEGIN
  -- Only emit when status changes to 'won'
  IF TG_OP = 'UPDATE' AND NEW.status = 'won' AND OLD.status != 'won' THEN
    IF NEW.current_stage_id IS NOT NULL THEN
      SELECT name INTO v_stage_name FROM pipeline_stages WHERE id = NEW.current_stage_id;
    END IF;
    
    v_sale_snapshot := jsonb_build_object(
      'deal_id', NEW.id,
      'value', NEW.value,
      'closed_at', NEW.closed_at,
      'final_stage_id', NEW.current_stage_id,
      'final_stage_name', v_stage_name,
      'notes', NEW.notes
    );
    
    v_payload := build_webhook_payload_v1(
      p_event_type := 'sale.recorded',
      p_brand_id := NEW.brand_id,
      p_event_id := NEW.id,
      p_occurred_at := COALESCE(NEW.closed_at, now()),
      p_refs := jsonb_build_object(
        'deal_id', NEW.id,
        'contact_id', NEW.contact_id
      ),
      p_contact_id := NEW.contact_id,
      p_deal_id := NEW.id,
      p_sale_snapshot := v_sale_snapshot
    );
    
    PERFORM enqueue_webhook_delivery(
      NEW.brand_id,
      'sale.recorded'::webhook_event_type,
      NEW.id,
      v_payload
    );
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_emit_sale_recorded ON deals;
CREATE TRIGGER trg_emit_sale_recorded
  AFTER UPDATE ON deals
  FOR EACH ROW
  EXECUTE FUNCTION emit_sale_recorded();