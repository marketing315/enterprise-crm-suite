
-- Drop and recreate claim_capi_events (cannot alter defaults)
DROP FUNCTION IF EXISTS public.claim_capi_events(integer, text);

CREATE FUNCTION public.claim_capi_events(p_limit integer, p_processing_by text DEFAULT NULL)
RETURNS SETOF public.meta_capi_event_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.meta_capi_event_queue
  SET 
    status = 'processing',
    processing_at = NOW(),
    processing_by = COALESCE(p_processing_by, gen_random_uuid()::text)
  WHERE id IN (
    SELECT id FROM public.meta_capi_event_queue
    WHERE (
      (status = 'pending')
      OR (status = 'processing' AND processing_at < NOW() - INTERVAL '5 minutes')
    )
      AND attempts < max_attempts
      AND consent_snapshot = true
    ORDER BY created_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

-- Fix queue_capi_purchase_event: NULL contact_id check + no bigint cast
CREATE OR REPLACE FUNCTION public.queue_capi_purchase_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meta_app_id uuid;
  v_contact_id uuid;
  v_consent boolean;
  v_deal_value numeric;
  v_custom_data jsonb;
  v_user_data jsonb;
  v_lead_id text;
BEGIN
  IF NEW.stage_name IS DISTINCT FROM 'Vinta' THEN
    RETURN NEW;
  END IF;
  IF OLD IS NOT NULL AND OLD.stage_name = 'Vinta' THEN
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
$$;

-- Fix queue_capi_lead_event: no bigint cast
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

-- Fix default action_source
ALTER TABLE public.meta_capi_event_queue
  ALTER COLUMN action_source SET DEFAULT 'system_generated';
