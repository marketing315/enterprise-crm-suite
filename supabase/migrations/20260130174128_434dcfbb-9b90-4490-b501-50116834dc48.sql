-- AI Decision Log table for tracking all AI decisions with full audit trail
CREATE TABLE public.ai_decision_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id uuid NOT NULL REFERENCES public.brands(id),
  lead_event_id uuid NOT NULL REFERENCES public.lead_events(id),
  ai_job_id uuid REFERENCES public.ai_jobs(id),
  
  -- Decision output
  lead_type text NOT NULL,
  priority integer NOT NULL CHECK (priority >= 1 AND priority <= 5),
  initial_stage_name text,
  tags_to_apply text[] NOT NULL DEFAULT '{}',
  should_create_ticket boolean NOT NULL DEFAULT false,
  ticket_type text,
  should_create_or_update_appointment boolean NOT NULL DEFAULT false,
  appointment_action text,
  rationale text NOT NULL,
  
  -- Model info
  model_version text NOT NULL,
  prompt_version text NOT NULL DEFAULT 'v2',
  confidence numeric CHECK (confidence >= 0 AND confidence <= 1),
  raw_response jsonb,
  
  -- Override tracking
  was_overridden boolean NOT NULL DEFAULT false,
  overridden_by_user_id uuid REFERENCES public.users(id),
  overridden_at timestamp with time zone,
  override_reason text,
  original_decision jsonb,
  
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_ai_decision_logs_brand ON ai_decision_logs(brand_id);
CREATE INDEX idx_ai_decision_logs_lead_event ON ai_decision_logs(lead_event_id);
CREATE INDEX idx_ai_decision_logs_created ON ai_decision_logs(created_at DESC);
CREATE INDEX idx_ai_decision_logs_overridden ON ai_decision_logs(was_overridden) WHERE was_overridden = true;

-- Enable RLS
ALTER TABLE public.ai_decision_logs ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view AI decision logs in their brands"
  ON public.ai_decision_logs
  FOR SELECT
  USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

-- Function to override AI decision with audit trail
CREATE OR REPLACE FUNCTION override_ai_decision(
  p_lead_event_id uuid,
  p_new_priority integer DEFAULT NULL,
  p_new_lead_type text DEFAULT NULL,
  p_new_should_create_ticket boolean DEFAULT NULL,
  p_override_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_brand_id uuid;
  v_decision_log ai_decision_logs%ROWTYPE;
  v_lead_event lead_events%ROWTYPE;
  v_original_decision jsonb;
BEGIN
  -- Get user id
  v_user_id := get_user_id(auth.uid());
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get lead event and validate brand access
  SELECT * INTO v_lead_event
  FROM lead_events
  WHERE id = p_lead_event_id
  FOR UPDATE;

  IF v_lead_event.id IS NULL THEN
    RAISE EXCEPTION 'Lead event not found';
  END IF;

  v_brand_id := v_lead_event.brand_id;

  IF NOT user_belongs_to_brand(v_user_id, v_brand_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Capture original values
  v_original_decision := jsonb_build_object(
    'lead_type', v_lead_event.lead_type,
    'priority', v_lead_event.ai_priority,
    'should_create_ticket', v_lead_event.should_create_ticket,
    'rationale', v_lead_event.ai_rationale
  );

  -- Update lead_event with overrides
  UPDATE lead_events
  SET
    ai_priority = COALESCE(p_new_priority, ai_priority),
    lead_type = COALESCE(p_new_lead_type::lead_type, lead_type),
    should_create_ticket = COALESCE(p_new_should_create_ticket, should_create_ticket)
  WHERE id = p_lead_event_id;

  -- Update or create decision log entry
  SELECT * INTO v_decision_log
  FROM ai_decision_logs
  WHERE lead_event_id = p_lead_event_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_decision_log.id IS NOT NULL AND NOT v_decision_log.was_overridden THEN
    -- Update existing log
    UPDATE ai_decision_logs
    SET
      was_overridden = true,
      overridden_by_user_id = v_user_id,
      overridden_at = now(),
      override_reason = p_override_reason,
      original_decision = v_original_decision
    WHERE id = v_decision_log.id;
  ELSE
    -- Create new override log entry
    INSERT INTO ai_decision_logs (
      brand_id,
      lead_event_id,
      lead_type,
      priority,
      should_create_ticket,
      rationale,
      model_version,
      prompt_version,
      was_overridden,
      overridden_by_user_id,
      overridden_at,
      override_reason,
      original_decision
    ) VALUES (
      v_brand_id,
      p_lead_event_id,
      COALESCE(p_new_lead_type, v_lead_event.lead_type::text, 'generic'),
      COALESCE(p_new_priority, v_lead_event.ai_priority, 3),
      COALESCE(p_new_should_create_ticket, v_lead_event.should_create_ticket, false),
      'Override manuale',
      'human',
      'manual',
      true,
      v_user_id,
      now(),
      p_override_reason,
      v_original_decision
    );
  END IF;

  -- Audit log
  INSERT INTO audit_log (brand_id, entity_type, entity_id, action, actor_user_id, old_value, new_value, metadata)
  VALUES (
    v_brand_id,
    'lead_event',
    p_lead_event_id,
    'ai_decision_overridden',
    v_user_id,
    v_original_decision,
    jsonb_build_object(
      'lead_type', COALESCE(p_new_lead_type, v_lead_event.lead_type::text),
      'priority', COALESCE(p_new_priority, v_lead_event.ai_priority),
      'should_create_ticket', COALESCE(p_new_should_create_ticket, v_lead_event.should_create_ticket)
    ),
    jsonb_build_object('reason', p_override_reason)
  );

  RETURN jsonb_build_object(
    'success', true,
    'lead_event_id', p_lead_event_id,
    'changes', jsonb_build_object(
      'priority', COALESCE(p_new_priority, v_lead_event.ai_priority),
      'lead_type', COALESCE(p_new_lead_type, v_lead_event.lead_type::text),
      'should_create_ticket', COALESCE(p_new_should_create_ticket, v_lead_event.should_create_ticket)
    )
  );
END;
$$;

-- Grant execute
GRANT EXECUTE ON FUNCTION override_ai_decision(uuid, integer, text, boolean, text) TO authenticated;