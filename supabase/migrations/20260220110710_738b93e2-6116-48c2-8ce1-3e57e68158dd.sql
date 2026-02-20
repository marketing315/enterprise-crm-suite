-- Fix trigger queue_capi_purchase: references NEW.stage_name which doesn't exist on deals table
-- The trigger should check the pipeline_stages table for the stage name instead
CREATE OR REPLACE FUNCTION public.queue_capi_purchase_event()
RETURNS TRIGGER AS $$
DECLARE
  v_meta_app_id uuid;
  v_contact_id uuid;
  v_consent boolean;
  v_deal_value numeric;
  v_custom_data jsonb;
  v_user_data jsonb;
  v_lead_id text;
  v_stage_name text;
BEGIN
  -- Look up the stage name from pipeline_stages
  IF NEW.current_stage_id IS NOT NULL THEN
    SELECT name INTO v_stage_name FROM pipeline_stages WHERE id = NEW.current_stage_id;
  END IF;

  -- Only fire when stage changes to a "won" equivalent, or deal status becomes 'won'
  -- Original logic checked stage_name = 'Vinta', but we should use deal status instead
  IF NEW.status IS DISTINCT FROM 'won' THEN
    RETURN NEW;
  END IF;
  IF OLD IS NOT NULL AND OLD.status = 'won' THEN
    RETURN NEW;
  END IF;

  IF NEW.contact_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_meta_app_id
  FROM meta_apps
  WHERE brand_id = NEW.brand_id
    AND is_active = true
    AND capi_enabled = true
  LIMIT 1;

  IF v_meta_app_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_contact_id := NEW.contact_id;

  SELECT COALESCE(marketing_consent, false) INTO v_consent
  FROM contacts
  WHERE id = v_contact_id;

  v_deal_value := COALESCE(NEW.value, 0);

  v_custom_data := jsonb_build_object(
    'event_source', 'crm',
    'lead_event_source', 'CRM Gruppo Benessere',
    'value', v_deal_value,
    'currency', 'EUR'
  );

  SELECT mle.leadgen_id::text INTO v_lead_id
  FROM meta_lead_events mle
  WHERE mle.contact_id = v_contact_id
  ORDER BY mle.received_at DESC
  LIMIT 1;

  v_user_data := '{}'::jsonb;
  IF v_lead_id IS NOT NULL THEN
    v_user_data := jsonb_build_object('lead_id', v_lead_id);
  END IF;

  INSERT INTO meta_capi_event_queue (
    brand_id, meta_app_id, event_name, event_id, event_time,
    action_source, contact_id, deal_id,
    custom_data, user_data, consent_snapshot
  ) VALUES (
    NEW.brand_id,
    v_meta_app_id,
    'Purchase',
    'purchase_' || NEW.id::text,
    now(),
    'system_generated',
    v_contact_id,
    NEW.id,
    v_custom_data,
    v_user_data,
    v_consent
  )
  ON CONFLICT (brand_id, event_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;