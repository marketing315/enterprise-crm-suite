CREATE OR REPLACE FUNCTION public.queue_capi_lead_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_meta_app_id uuid;
  v_consent boolean;
  v_custom_data jsonb;
  v_user_data jsonb;
  v_lead_id text;
BEGIN
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

  v_custom_data := jsonb_build_object(
    'event_source', 'crm',
    'lead_event_source', 'CRM Gruppo Benessere'
  );

  -- Fix: use received_at instead of created_at
  SELECT mle.leadgen_id::text INTO v_lead_id
  FROM meta_lead_events mle
  WHERE mle.contact_id = NEW.contact_id
  ORDER BY mle.received_at DESC
  LIMIT 1;

  v_user_data := '{}'::jsonb;
  IF v_lead_id IS NOT NULL THEN
    v_user_data := jsonb_build_object('lead_id', v_lead_id::bigint);
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
  );

  RETURN NEW;
END;
$function$