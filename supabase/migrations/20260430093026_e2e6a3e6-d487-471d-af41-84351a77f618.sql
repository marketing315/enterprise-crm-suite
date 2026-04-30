-- ============================================================
-- TICKET ESCALATION POLICIES — centralized, per-brand config
-- Purely additive. Backwards compatible: old default 30/120/480 min preserved.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ticket_escalation_policies (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id uuid REFERENCES public.brands(id) ON DELETE CASCADE,
  -- NULL brand_id = global default policy. Only one per brand allowed.
  is_default boolean NOT NULL DEFAULT false,
  level_1_minutes integer NOT NULL DEFAULT 30  CHECK (level_1_minutes >= 1),
  level_2_minutes integer NOT NULL DEFAULT 120 CHECK (level_2_minutes >  level_1_minutes),
  level_3_minutes integer NOT NULL DEFAULT 480 CHECK (level_3_minutes >  level_2_minutes),
  -- Ruoli destinatari per livello (ordine = priorità di selezione)
  level_1_roles app_role[] NOT NULL DEFAULT ARRAY['responsabile_callcenter','admin']::app_role[],
  level_2_roles app_role[] NOT NULL DEFAULT ARRAY['responsabile_callcenter','responsabile_venditori','admin']::app_role[],
  level_3_roles app_role[] NOT NULL DEFAULT ARRAY['admin','ceo']::app_role[],
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users(id),
  updated_by uuid REFERENCES public.users(id)
);

-- Una sola policy per brand (NULL = globale, unique parziale)
CREATE UNIQUE INDEX IF NOT EXISTS ux_ticket_escalation_policies_brand
  ON public.ticket_escalation_policies (brand_id)
  WHERE brand_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_ticket_escalation_policies_default
  ON public.ticket_escalation_policies ((1))
  WHERE brand_id IS NULL AND is_default = true;

-- Seed default global policy (soglie attuali hard-coded, ruoli equivalenti)
INSERT INTO public.ticket_escalation_policies (brand_id, is_default, notes)
SELECT NULL, true, 'Default global policy — fallback for brands without override'
WHERE NOT EXISTS (
  SELECT 1 FROM public.ticket_escalation_policies WHERE brand_id IS NULL AND is_default = true
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.touch_ticket_escalation_policy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_ticket_escalation_policy ON public.ticket_escalation_policies;
CREATE TRIGGER trg_touch_ticket_escalation_policy
  BEFORE UPDATE ON public.ticket_escalation_policies
  FOR EACH ROW EXECUTE FUNCTION public.touch_ticket_escalation_policy();

-- RLS: admin/ceo gestiscono; brand admin (responsabile_callcenter del brand) leggono
ALTER TABLE public.ticket_escalation_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ticket_escalation_policies_select_authorized"
ON public.ticket_escalation_policies
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'ceo'::app_role)
  OR (brand_id IS NOT NULL AND user_belongs_to_brand(get_user_id(auth.uid()), brand_id))
  OR brand_id IS NULL
);

CREATE POLICY "ticket_escalation_policies_admin_all"
ON public.ticket_escalation_policies
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'ceo'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'ceo'::app_role)
);

-- ============================================================
-- Resolver: returns the effective policy for a brand (with fallback)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_ticket_escalation_policy(p_brand_id uuid)
RETURNS public.ticket_escalation_policies
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.ticket_escalation_policies
  WHERE brand_id = p_brand_id
  UNION ALL
  SELECT *
  FROM public.ticket_escalation_policies
  WHERE brand_id IS NULL AND is_default = true
  ORDER BY brand_id NULLS LAST
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.get_ticket_escalation_policy(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ticket_escalation_policy(uuid) TO authenticated;

-- ============================================================
-- Refactor: escalate_breached_tickets uses policy (soglie + ruoli per livello)
-- Backwards compatible: same signature, same return shape.
-- ============================================================
CREATE OR REPLACE FUNCTION public.escalate_breached_tickets(p_brand_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket RECORD;
  v_target_level integer;
  v_minutes_since_breach numeric;
  v_escalated_count integer := 0;
  v_manager_user_id uuid;
  v_target_roles app_role[];
  v_results jsonb := '[]'::jsonb;
  v_policy public.ticket_escalation_policies;
BEGIN
  -- Resolve policy once per brand
  SELECT * INTO v_policy FROM public.get_ticket_escalation_policy(p_brand_id);

  -- Hard fallback if no policy at all (shouldn't happen, default seeded)
  IF v_policy.id IS NULL THEN
    v_policy.level_1_minutes := 30;
    v_policy.level_2_minutes := 120;
    v_policy.level_3_minutes := 480;
    v_policy.level_1_roles := ARRAY['responsabile_callcenter','admin']::app_role[];
    v_policy.level_2_roles := ARRAY['responsabile_callcenter','responsabile_venditori','admin']::app_role[];
    v_policy.level_3_roles := ARRAY['admin','ceo']::app_role[];
  END IF;

  FOR v_ticket IN
    SELECT t.id, t.priority, t.opened_at, t.sla_breached_at,
           t.escalation_level, t.assigned_to_user_id
    FROM tickets t
    WHERE t.brand_id = p_brand_id
      AND t.status IN ('open', 'in_progress', 'reopened')
      AND t.sla_breached_at IS NOT NULL
    LIMIT 500
  LOOP
    v_minutes_since_breach := EXTRACT(EPOCH FROM (now() - v_ticket.sla_breached_at)) / 60;

    v_target_level := CASE
      WHEN v_minutes_since_breach >= v_policy.level_3_minutes THEN 3
      WHEN v_minutes_since_breach >= v_policy.level_2_minutes THEN 2
      WHEN v_minutes_since_breach >= v_policy.level_1_minutes THEN 1
      ELSE 0
    END;

    IF v_target_level <= v_ticket.escalation_level THEN
      CONTINUE;
    END IF;

    -- Roles for this level
    v_target_roles := CASE v_target_level
      WHEN 1 THEN v_policy.level_1_roles
      WHEN 2 THEN v_policy.level_2_roles
      WHEN 3 THEN v_policy.level_3_roles
    END;

    -- Find a recipient honouring the role priority order in the array
    SELECT ur.user_id INTO v_manager_user_id
    FROM user_roles ur
    JOIN users u ON u.id = ur.user_id AND u.is_active = true
    WHERE ur.brand_id = p_brand_id
      AND ur.role = ANY(v_target_roles)
    ORDER BY array_position(v_target_roles, ur.role) NULLS LAST,
             ur.created_at ASC
    LIMIT 1;

    -- Fallback: cross-brand admin/ceo if nothing found in this brand
    IF v_manager_user_id IS NULL THEN
      SELECT ur.user_id INTO v_manager_user_id
      FROM user_roles ur
      JOIN users u ON u.id = ur.user_id AND u.is_active = true
      WHERE ur.role IN ('admin','ceo')
      ORDER BY CASE ur.role WHEN 'admin' THEN 1 WHEN 'ceo' THEN 2 END
      LIMIT 1;
    END IF;

    UPDATE tickets
    SET escalation_level = v_target_level,
        escalated_at = now(),
        escalated_to_user_id = v_manager_user_id
    WHERE id = v_ticket.id;

    INSERT INTO ticket_audit_logs (brand_id, ticket_id, action_type, new_value, metadata)
    VALUES (
      p_brand_id,
      v_ticket.id,
      'sla_escalation',
      jsonb_build_object('escalation_level', v_target_level),
      jsonb_build_object(
        'previous_level', v_ticket.escalation_level,
        'minutes_since_breach', ROUND(v_minutes_since_breach),
        'escalated_to_user_id', v_manager_user_id,
        'priority', v_ticket.priority,
        'policy_id', v_policy.id,
        'target_roles', to_jsonb(v_target_roles)
      )
    );

    IF v_manager_user_id IS NOT NULL THEN
      INSERT INTO notifications (brand_id, user_id, type, title, body, entity_type, entity_id)
      VALUES (
        p_brand_id,
        v_manager_user_id,
        'ticket_escalated',
        format('Escalation L%s ticket SLA breached', v_target_level),
        format('Ticket in breach SLA da %s minuti — richiede intervento immediato',
               ROUND(v_minutes_since_breach)),
        'ticket',
        v_ticket.id
      );

      INSERT INTO action_suggestions (
        brand_id, user_id, entity_type, entity_id,
        suggestion_type, title, description, priority, confidence,
        metadata, expires_at
      )
      VALUES (
        p_brand_id,
        v_manager_user_id,
        'ticket',
        v_ticket.id,
        'escalate',
        format('Escalation ticket L%s', v_target_level),
        format('SLA breach da %s minuti. Riassegna o intervieni.',
               ROUND(v_minutes_since_breach)),
        CASE v_target_level WHEN 3 THEN 1 WHEN 2 THEN 2 ELSE 3 END,
        0.95,
        jsonb_build_object(
          'escalation_level', v_target_level,
          'minutes_since_breach', ROUND(v_minutes_since_breach),
          'policy_id', v_policy.id
        ),
        now() + interval '24 hours'
      );
    END IF;

    v_escalated_count := v_escalated_count + 1;
    v_results := v_results || jsonb_build_object(
      'ticket_id', v_ticket.id,
      'level', v_target_level,
      'minutes_since_breach', ROUND(v_minutes_since_breach),
      'recipient_user_id', v_manager_user_id
    );
  END LOOP;

  RETURN jsonb_build_object(
    'brand_id', p_brand_id,
    'policy_id', v_policy.id,
    'escalated_count', v_escalated_count,
    'tickets', v_results,
    'checked_at', now()
  );
END;
$$;