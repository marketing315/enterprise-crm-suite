
-- Fix queue_capi_lead_event: handle NULL contact_id gracefully
CREATE OR REPLACE FUNCTION public.queue_capi_lead_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meta_app_id uuid;
  v_consent boolean;
  v_custom_data jsonb;
  v_user_data jsonb;
  v_lead_id text;
BEGIN
  -- Skip archived
  IF NEW.archived THEN
    RETURN NEW;
  END IF;

  -- Skip if no contact (can't build CAPI user_data)
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

  SELECT COALESCE(marketing_consent, false) INTO v_consent
  FROM contacts
  WHERE id = NEW.contact_id;

  -- Safety: if contact somehow not found, default to false
  IF v_consent IS NULL THEN
    v_consent := false;
  END IF;

  v_custom_data := jsonb_build_object(
    'event_source', 'crm',
    'lead_event_source', 'CRM Gruppo Benessere'
  );

  SELECT mle.leadgen_id::text INTO v_lead_id
  FROM meta_lead_events mle
  WHERE mle.contact_id = NEW.contact_id
  ORDER BY mle.received_at DESC
  LIMIT 1;

  v_user_data := '{}'::jsonb;
  IF v_lead_id IS NOT NULL THEN
    v_user_data := jsonb_build_object('lead_id', v_lead_id);
  END IF;

  INSERT INTO meta_capi_event_queue (
    brand_id, meta_app_id, event_name, event_id, event_time,
    action_source, contact_id, lead_event_id,
    custom_data, user_data, consent_snapshot
  ) VALUES (
    NEW.brand_id,
    v_meta_app_id,
    'Lead',
    'lead_' || NEW.id::text,
    now(),
    'system_generated',
    NEW.contact_id,
    NEW.id,
    v_custom_data,
    v_user_data,
    v_consent
  )
  ON CONFLICT (brand_id, event_id) DO NOTHING;

  RETURN NEW;
END;
$$;
