-- Fix search_path on helper functions (STABLE functions don't need SECURITY DEFINER)
-- But adding explicit search_path for security compliance

-- Re-create with explicit search_path
CREATE OR REPLACE FUNCTION public.build_contact_snapshot(p_contact_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE
SET search_path = public
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

CREATE OR REPLACE FUNCTION public.build_deal_snapshot(p_deal_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE
SET search_path = public
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

CREATE OR REPLACE FUNCTION public.build_entity_tags(
  p_brand_id UUID,
  p_contact_id UUID DEFAULT NULL,
  p_deal_id UUID DEFAULT NULL,
  p_lead_event_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql STABLE
SET search_path = public
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
SET search_path = public
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