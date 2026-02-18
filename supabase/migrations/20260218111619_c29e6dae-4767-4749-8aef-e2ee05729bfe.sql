
-- Migration: filtro lead_events.archived su tutti i trigger
-- Questo impedisce che lead duplicati (archived=true) vengano inviati a
-- Google Sheets, webhook outbound, AI classification e Meta CAPI

-- 1. emit_lead_event_created: skip se archived
CREATE OR REPLACE FUNCTION public.emit_lead_event_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_payload JSONB;
  v_event_snapshot JSONB;
BEGIN
  -- Skip duplicates and opted-out contacts
  IF NEW.archived THEN
    RETURN NEW;
  END IF;

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
$function$;

-- 2. notify_sheets_new_lead: skip se archived
CREATE OR REPLACE FUNCTION public.notify_sheets_new_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _url text;
  _anon_key text;
BEGIN
  -- Skip duplicates and opted-out contacts
  IF NEW.archived THEN
    RETURN NEW;
  END IF;

  _url := 'https://qmqcjtmcxfqahhubpaea.supabase.co/functions/v1/sheets-leads-export';

  SELECT decrypted_secret INTO _anon_key
  FROM vault.decrypted_secrets
  WHERE name = 'supabase_anon_key'
  LIMIT 1;

  PERFORM net.http_post(
    url := _url,
    body := jsonb_build_object('lead_event_id', NEW.id),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(_anon_key, ''),
      'apikey', COALESCE(_anon_key, '')
    )
  );

  RETURN NEW;
END;
$function$;

-- 3. enqueue_ai_classification: skip se archived
CREATE OR REPLACE FUNCTION public.enqueue_ai_classification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Skip duplicates and opted-out contacts
  IF NEW.archived THEN
    RETURN NEW;
  END IF;

  -- Create a job for AI classification
  INSERT INTO public.ai_jobs (brand_id, lead_event_id)
  VALUES (NEW.brand_id, NEW.id)
  ON CONFLICT (lead_event_id) DO NOTHING;
  
  RETURN NEW;
END;
$function$;

-- 4. queue_capi_lead_event: skip se archived
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
  -- Skip duplicates and opted-out contacts
  IF NEW.archived THEN
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
$function$;
