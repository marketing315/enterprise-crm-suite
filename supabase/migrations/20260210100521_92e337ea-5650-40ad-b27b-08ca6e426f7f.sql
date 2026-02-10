-- Update trigger: always use action_source = 'system_generated' and add CRM custom_data + lead_id
CREATE OR REPLACE FUNCTION public.queue_capi_lead_event() 
RETURNS TRIGGER AS $$
DECLARE
  v_meta_app RECORD;
  v_consent BOOLEAN;
  v_custom_data JSONB;
  v_leadgen_id TEXT;
BEGIN
  IF NEW.contact_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id, pixel_id INTO v_meta_app
  FROM meta_apps
  WHERE brand_id = NEW.brand_id
    AND capi_enabled = true
    AND pixel_id IS NOT NULL
  LIMIT 1;

  IF v_meta_app.id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT marketing_consent INTO v_consent
  FROM contacts WHERE id = NEW.contact_id;

  -- Build custom_data per Meta CRM integration spec
  v_custom_data := jsonb_build_object(
    'event_source', 'crm',
    'lead_event_source', 'RalphCRM'
  );

  -- Try to find Meta leadgen_id for lead_id parameter
  SELECT mle.leadgen_id INTO v_leadgen_id
  FROM meta_lead_events mle
  WHERE mle.contact_id = NEW.contact_id
    AND mle.brand_id = NEW.brand_id
    AND mle.status = 'processed'
  ORDER BY mle.created_at DESC
  LIMIT 1;

  INSERT INTO meta_capi_event_queue (
    brand_id, meta_app_id, event_name, event_id,
    event_time, action_source, custom_data,
    contact_id, deal_id, lead_event_id,
    consent_snapshot, status,
    user_data
  ) VALUES (
    NEW.brand_id, v_meta_app.id, 'Lead',
    'lead_' || NEW.id,
    NEW.occurred_at,
    'system_generated',
    v_custom_data,
    NEW.contact_id, NEW.deal_id, NEW.id,
    COALESCE(v_consent, false),
    CASE WHEN v_consent = true THEN 'pending' ELSE 'skipped' END,
    CASE WHEN v_leadgen_id IS NOT NULL 
      THEN jsonb_build_object('lead_id', v_leadgen_id::bigint)
      ELSE NULL 
    END
  )
  ON CONFLICT (brand_id, event_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Update purchase trigger too
CREATE OR REPLACE FUNCTION public.queue_capi_purchase_event() 
RETURNS TRIGGER AS $$
DECLARE
  v_meta_app RECORD;
  v_consent BOOLEAN;
  v_custom_data JSONB;
  v_leadgen_id TEXT;
BEGIN
  IF NEW.status != 'won' OR (OLD.status IS NOT NULL AND OLD.status = 'won') THEN
    RETURN NEW;
  END IF;

  SELECT id, pixel_id INTO v_meta_app
  FROM meta_apps
  WHERE brand_id = NEW.brand_id
    AND capi_enabled = true
    AND pixel_id IS NOT NULL
  LIMIT 1;

  IF v_meta_app.id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT marketing_consent INTO v_consent
  FROM contacts WHERE id = NEW.contact_id;

  v_custom_data := jsonb_build_object(
    'event_source', 'crm',
    'lead_event_source', 'RalphCRM'
  );

  -- Try to find Meta leadgen_id
  SELECT mle.leadgen_id INTO v_leadgen_id
  FROM meta_lead_events mle
  WHERE mle.contact_id = NEW.contact_id
    AND mle.brand_id = NEW.brand_id
    AND mle.status = 'processed'
  ORDER BY mle.created_at DESC
  LIMIT 1;

  INSERT INTO meta_capi_event_queue (
    brand_id, meta_app_id, event_name, event_id,
    event_time, action_source, custom_data,
    contact_id, deal_id,
    consent_snapshot, status,
    user_data
  ) VALUES (
    NEW.brand_id, v_meta_app.id, 'Purchase',
    'purchase_' || NEW.id,
    COALESCE(NEW.closed_at, NOW()),
    'system_generated',
    v_custom_data,
    NEW.contact_id, NEW.id,
    COALESCE(v_consent, false),
    CASE WHEN v_consent = true THEN 'pending' ELSE 'skipped' END,
    CASE WHEN v_leadgen_id IS NOT NULL 
      THEN jsonb_build_object('lead_id', v_leadgen_id::bigint)
      ELSE NULL 
    END
  )
  ON CONFLICT (brand_id, event_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;