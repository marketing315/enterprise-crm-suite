-- ============================================================
-- RPC: create_manual_lead_event
-- Creates a manual lead_event for a contact (when no prior events exist)
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_manual_lead_event(
  p_brand_id uuid,
  p_contact_id uuid,
  p_source_name text DEFAULT 'Creazione manuale',
  p_lead_source_channel lead_source_channel DEFAULT NULL,
  p_contact_channel contact_channel DEFAULT NULL,
  p_pacemaker_status pacemaker_status DEFAULT NULL,
  p_customer_sentiment customer_sentiment DEFAULT NULL,
  p_decision_status decision_status DEFAULT NULL,
  p_objection_type objection_type DEFAULT NULL,
  p_booking_notes text DEFAULT NULL,
  p_logistics_notes text DEFAULT NULL,
  p_ai_conversation_summary text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_event_id uuid;
BEGIN
  -- Resolve app user
  v_user_id := get_user_id(auth.uid());
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Brand access check
  IF NOT user_belongs_to_brand(v_user_id, p_brand_id) THEN
    RAISE EXCEPTION 'Forbidden: no access to brand';
  END IF;

  -- Verify contact belongs to brand
  IF NOT EXISTS (
    SELECT 1 FROM public.contacts 
    WHERE id = p_contact_id AND brand_id = p_brand_id
  ) THEN
    RAISE EXCEPTION 'Contact not found or does not belong to brand';
  END IF;

  -- Insert the manual lead_event
  INSERT INTO public.lead_events (
    brand_id,
    contact_id,
    source,
    source_name,
    raw_payload,
    occurred_at,
    received_at,
    lead_source_channel,
    contact_channel,
    pacemaker_status,
    customer_sentiment,
    decision_status,
    objection_type,
    booking_notes,
    logistics_notes,
    ai_conversation_summary
  ) VALUES (
    p_brand_id,
    p_contact_id,
    'manual'::lead_source_type,
    COALESCE(p_source_name, 'Creazione manuale'),
    jsonb_build_object('created_by_user_id', v_user_id::text, 'created_at', now()::text),
    now(),
    now(),
    p_lead_source_channel,
    p_contact_channel,
    p_pacemaker_status,
    p_customer_sentiment,
    p_decision_status,
    p_objection_type,
    p_booking_notes,
    p_logistics_notes,
    p_ai_conversation_summary
  )
  RETURNING id INTO v_event_id;

  -- Audit log
  INSERT INTO public.audit_log (
    brand_id,
    entity_type,
    entity_id,
    action,
    actor_user_id,
    new_value
  ) VALUES (
    p_brand_id,
    'lead_event',
    v_event_id,
    'create_manual',
    v_user_id,
    jsonb_build_object('contact_id', p_contact_id, 'source', 'manual')
  );

  RETURN v_event_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_manual_lead_event TO authenticated;

-- ============================================================
-- RPC: update_lead_event_qualification
-- Updates qualification fields on an existing lead_event
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_lead_event_qualification(
  p_event_id uuid,
  p_lead_source_channel lead_source_channel DEFAULT NULL,
  p_contact_channel contact_channel DEFAULT NULL,
  p_pacemaker_status pacemaker_status DEFAULT NULL,
  p_customer_sentiment customer_sentiment DEFAULT NULL,
  p_decision_status decision_status DEFAULT NULL,
  p_objection_type objection_type DEFAULT NULL,
  p_booking_notes text DEFAULT NULL,
  p_logistics_notes text DEFAULT NULL,
  p_ai_conversation_summary text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_brand_id uuid;
  v_old_values jsonb;
BEGIN
  -- Resolve app user
  v_user_id := get_user_id(auth.uid());
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Get event's brand_id and verify it exists
  SELECT brand_id INTO v_brand_id
  FROM public.lead_events
  WHERE id = p_event_id;

  IF v_brand_id IS NULL THEN
    RAISE EXCEPTION 'Lead event not found';
  END IF;

  -- Brand access check
  IF NOT user_belongs_to_brand(v_user_id, v_brand_id) THEN
    RAISE EXCEPTION 'Forbidden: no access to brand';
  END IF;

  -- Capture old values for audit
  SELECT jsonb_build_object(
    'lead_source_channel', lead_source_channel,
    'contact_channel', contact_channel,
    'pacemaker_status', pacemaker_status,
    'customer_sentiment', customer_sentiment,
    'decision_status', decision_status,
    'objection_type', objection_type,
    'booking_notes', booking_notes,
    'logistics_notes', logistics_notes,
    'ai_conversation_summary', ai_conversation_summary
  ) INTO v_old_values
  FROM public.lead_events
  WHERE id = p_event_id;

  -- Update the lead_event with new qualification values
  -- Using COALESCE to only update non-null parameters (preserves existing values)
  UPDATE public.lead_events SET
    lead_source_channel = COALESCE(p_lead_source_channel, lead_source_channel),
    contact_channel = COALESCE(p_contact_channel, contact_channel),
    pacemaker_status = COALESCE(p_pacemaker_status, pacemaker_status),
    customer_sentiment = COALESCE(p_customer_sentiment, customer_sentiment),
    decision_status = COALESCE(p_decision_status, decision_status),
    objection_type = COALESCE(p_objection_type, objection_type),
    booking_notes = COALESCE(p_booking_notes, booking_notes),
    logistics_notes = COALESCE(p_logistics_notes, logistics_notes),
    ai_conversation_summary = COALESCE(p_ai_conversation_summary, ai_conversation_summary)
  WHERE id = p_event_id;

  -- Audit log
  INSERT INTO public.audit_log (
    brand_id,
    entity_type,
    entity_id,
    action,
    actor_user_id,
    old_value,
    new_value
  ) VALUES (
    v_brand_id,
    'lead_event',
    p_event_id,
    'update_qualification',
    v_user_id,
    v_old_values,
    jsonb_build_object(
      'lead_source_channel', p_lead_source_channel,
      'contact_channel', p_contact_channel,
      'pacemaker_status', p_pacemaker_status,
      'customer_sentiment', p_customer_sentiment,
      'decision_status', p_decision_status,
      'objection_type', p_objection_type,
      'booking_notes', p_booking_notes,
      'logistics_notes', p_logistics_notes,
      'ai_conversation_summary', p_ai_conversation_summary
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_lead_event_qualification TO authenticated;

-- ============================================================
-- RPC: list_contact_lead_events
-- Fetches all lead_events for a specific contact (for UI selection)
-- ============================================================

CREATE OR REPLACE FUNCTION public.list_contact_lead_events(
  p_contact_id uuid,
  p_include_archived boolean DEFAULT FALSE
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_brand_id uuid;
  v_user_role app_role;
  v_result json;
BEGIN
  -- Resolve app user
  v_user_id := get_user_id(auth.uid());
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Get contact's brand_id
  SELECT brand_id INTO v_brand_id
  FROM public.contacts
  WHERE id = p_contact_id;

  IF v_brand_id IS NULL THEN
    RAISE EXCEPTION 'Contact not found';
  END IF;

  -- Brand access check
  IF NOT user_belongs_to_brand(v_user_id, v_brand_id) THEN
    RAISE EXCEPTION 'Forbidden: no access to brand';
  END IF;

  -- Role check for archived visibility
  IF COALESCE(p_include_archived, FALSE) = TRUE THEN
    SELECT ur.role INTO v_user_role
    FROM public.user_roles ur
    WHERE ur.user_id = v_user_id AND ur.brand_id = v_brand_id
    LIMIT 1;

    IF v_user_role IS NULL OR v_user_role NOT IN ('admin', 'ceo') THEN
      RAISE EXCEPTION 'Forbidden: include_archived requires admin/ceo';
    END IF;
  END IF;

  -- Fetch events with clinical topics
  SELECT json_agg(
    json_build_object(
      'id', le.id,
      'source', le.source,
      'source_name', le.source_name,
      'occurred_at', le.occurred_at,
      'received_at', le.received_at,
      'ai_priority', le.ai_priority,
      'lead_type', le.lead_type,
      'lead_source_channel', le.lead_source_channel,
      'contact_channel', le.contact_channel,
      'pacemaker_status', le.pacemaker_status,
      'customer_sentiment', le.customer_sentiment,
      'decision_status', le.decision_status,
      'objection_type', le.objection_type,
      'booking_notes', le.booking_notes,
      'logistics_notes', le.logistics_notes,
      'ai_conversation_summary', le.ai_conversation_summary,
      'archived', le.archived,
      'clinical_topics', COALESCE(
        (
          SELECT json_agg(json_build_object(
            'id', ct.id,
            'canonical_name', ct.canonical_name,
            'needs_review', ct.needs_review
          ))
          FROM public.lead_event_clinical_topics lect
          JOIN public.clinical_topics ct ON ct.id = lect.topic_id
          WHERE lect.lead_event_id = le.id
        ),
        '[]'::json
      )
    )
    ORDER BY le.received_at DESC
  )
  INTO v_result
  FROM public.lead_events le
  WHERE le.contact_id = p_contact_id
    AND (p_include_archived = TRUE OR le.archived = FALSE);

  RETURN COALESCE(v_result, '[]'::json);
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_contact_lead_events TO authenticated;