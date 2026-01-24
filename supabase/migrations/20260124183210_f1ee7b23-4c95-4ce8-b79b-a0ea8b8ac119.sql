-- 1. Tabella stato Round Robin per brand
CREATE TABLE public.brand_assignment_state (
  brand_id UUID PRIMARY KEY REFERENCES public.brands(id) ON DELETE CASCADE,
  last_assigned_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: solo admin possono vedere/modificare (usata internamente via RPC)
ALTER TABLE public.brand_assignment_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage assignment state"
ON public.brand_assignment_state
FOR ALL
USING (has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role))
WITH CHECK (has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin'::app_role));

-- 2. RPC atomica per Round Robin
CREATE OR REPLACE FUNCTION public.assign_ticket_round_robin(
  p_brand_id UUID,
  p_ticket_id UUID
)
RETURNS TABLE(
  assigned_user_id UUID,
  assigned_user_name TEXT,
  was_assigned BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket RECORD;
  v_operators UUID[];
  v_operator_names TEXT[];
  v_last_assigned UUID;
  v_next_idx INT;
  v_next_user_id UUID;
  v_next_user_name TEXT;
BEGIN
  -- 1. Lock e verifica ticket
  SELECT t.id, t.brand_id, t.assigned_to_user_id, t.status, le.lead_type
  INTO v_ticket
  FROM tickets t
  LEFT JOIN lead_events le ON le.id = t.source_event_id
  WHERE t.id = p_ticket_id
    AND t.brand_id = p_brand_id
  FOR UPDATE OF t;

  -- Ticket non trovato o già assegnato
  IF v_ticket IS NULL OR v_ticket.assigned_to_user_id IS NOT NULL THEN
    RETURN QUERY SELECT NULL::UUID, NULL::TEXT, false;
    RETURN;
  END IF;

  -- Solo ticket open/reopened
  IF v_ticket.status NOT IN ('open', 'reopened') THEN
    RETURN QUERY SELECT NULL::UUID, NULL::TEXT, false;
    RETURN;
  END IF;

  -- Solo ticket support (lead_type = 'support')
  IF v_ticket.lead_type IS DISTINCT FROM 'support' THEN
    RETURN QUERY SELECT NULL::UUID, NULL::TEXT, false;
    RETURN;
  END IF;

  -- 2. Carica operatori callcenter ordinati stabilmente
  SELECT 
    array_agg(op.user_id ORDER BY op.full_name NULLS LAST, op.email),
    array_agg(COALESCE(op.full_name, op.email) ORDER BY op.full_name NULLS LAST, op.email)
  INTO v_operators, v_operator_names
  FROM get_brand_operators(p_brand_id) op
  WHERE op.role = 'callcenter';

  -- Nessun operatore disponibile
  IF v_operators IS NULL OR array_length(v_operators, 1) IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, NULL::TEXT, false;
    RETURN;
  END IF;

  -- 3. Lock e leggi stato RR (upsert se non esiste)
  INSERT INTO brand_assignment_state (brand_id, last_assigned_user_id)
  VALUES (p_brand_id, NULL)
  ON CONFLICT (brand_id) DO NOTHING;

  SELECT last_assigned_user_id INTO v_last_assigned
  FROM brand_assignment_state
  WHERE brand_id = p_brand_id
  FOR UPDATE;

  -- 4. Calcola next operator (wrap-around)
  v_next_idx := 1; -- default: primo operatore
  
  IF v_last_assigned IS NOT NULL THEN
    FOR i IN 1..array_length(v_operators, 1) LOOP
      IF v_operators[i] = v_last_assigned THEN
        v_next_idx := i + 1;
        IF v_next_idx > array_length(v_operators, 1) THEN
          v_next_idx := 1; -- wrap-around
        END IF;
        EXIT;
      END IF;
    END LOOP;
  END IF;

  v_next_user_id := v_operators[v_next_idx];
  v_next_user_name := v_operator_names[v_next_idx];

  -- 5. Aggiorna ticket
  UPDATE tickets SET
    assigned_to_user_id = v_next_user_id,
    assigned_at = now(),
    assigned_by_user_id = NULL, -- system assignment
    updated_at = now()
  WHERE id = p_ticket_id;

  -- 6. Aggiorna stato RR
  UPDATE brand_assignment_state SET
    last_assigned_user_id = v_next_user_id,
    updated_at = now()
  WHERE brand_id = p_brand_id;

  RETURN QUERY SELECT v_next_user_id, v_next_user_name, true;
END;
$$;

-- 3. RPC batch per recovery scheduler
CREATE OR REPLACE FUNCTION public.assign_unassigned_support_tickets(p_brand_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket_id UUID;
  v_count INT := 0;
  v_result RECORD;
BEGIN
  -- Loop su ticket support non assegnati
  FOR v_ticket_id IN
    SELECT t.id
    FROM tickets t
    LEFT JOIN lead_events le ON le.id = t.source_event_id
    WHERE t.brand_id = p_brand_id
      AND t.assigned_to_user_id IS NULL
      AND t.status IN ('open', 'reopened')
      AND le.lead_type = 'support'
    ORDER BY t.opened_at ASC
    LIMIT 50 -- batch size
  LOOP
    SELECT * INTO v_result FROM assign_ticket_round_robin(p_brand_id, v_ticket_id);
    IF v_result.was_assigned THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;
  
  RETURN v_count;
END;
$$;

-- Grant execute
GRANT EXECUTE ON FUNCTION public.assign_ticket_round_robin(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assign_unassigned_support_tickets(UUID) TO service_role;