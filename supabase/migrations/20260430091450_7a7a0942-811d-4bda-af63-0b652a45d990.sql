-- ============================================================
-- AUTO-ESCALATION TICKETS + AI OVERRIDE DASHBOARD
-- Purely additive: no DROP, no DELETE, no breaking changes
-- ============================================================

-- 1. Add escalation columns to tickets (nullable, with defaults)
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS escalation_level integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS escalated_at timestamptz,
  ADD COLUMN IF NOT EXISTS escalated_to_user_id uuid REFERENCES public.users(id);

CREATE INDEX IF NOT EXISTS idx_tickets_escalation
  ON public.tickets (brand_id, escalation_level, escalated_at DESC)
  WHERE escalation_level > 0;

-- 2. Additive enum value for notification_type
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'ticket_escalated';

-- 3. Additive enum value for ticket_audit_action
ALTER TYPE public.ticket_audit_action ADD VALUE IF NOT EXISTS 'sla_escalation';

-- ============================================================
-- 4. Escalation function per brand
-- Escalation thresholds (minutes AFTER sla_breached_at):
--   level 1 → 30 min after breach
--   level 2 → 120 min after breach
--   level 3 → 480 min (8h) after breach
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
  v_results jsonb := '[]'::jsonb;
BEGIN
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

    -- Determine target level based on time since breach
    v_target_level := CASE
      WHEN v_minutes_since_breach >= 480 THEN 3
      WHEN v_minutes_since_breach >= 120 THEN 2
      WHEN v_minutes_since_breach >= 30  THEN 1
      ELSE 0
    END;

    -- Skip if already at/above target level
    IF v_target_level <= v_ticket.escalation_level THEN
      CONTINUE;
    END IF;

    -- Find a manager: prefer responsabile_callcenter for the brand, else admin
    SELECT ur.user_id INTO v_manager_user_id
    FROM user_roles ur
    JOIN users u ON u.id = ur.user_id AND u.is_active = true
    WHERE ur.brand_id = p_brand_id
      AND ur.role IN ('responsabile_callcenter', 'admin')
    ORDER BY CASE ur.role
      WHEN 'responsabile_callcenter' THEN 1
      WHEN 'admin' THEN 2
      ELSE 3
    END
    LIMIT 1;

    -- Update ticket
    UPDATE tickets
    SET escalation_level = v_target_level,
        escalated_at = now(),
        escalated_to_user_id = v_manager_user_id
    WHERE id = v_ticket.id;

    -- Audit log
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
        'priority', v_ticket.priority
      )
    );

    -- Notify the manager (only if found)
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

      -- Action suggestion of type "escalate"
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
          'minutes_since_breach', ROUND(v_minutes_since_breach)
        ),
        now() + interval '24 hours'
      );
    END IF;

    v_escalated_count := v_escalated_count + 1;
    v_results := v_results || jsonb_build_object(
      'ticket_id', v_ticket.id,
      'level', v_target_level,
      'minutes_since_breach', ROUND(v_minutes_since_breach)
    );
  END LOOP;

  RETURN jsonb_build_object(
    'brand_id', p_brand_id,
    'escalated_count', v_escalated_count,
    'tickets', v_results,
    'checked_at', now()
  );
END;
$$;

-- 5. Cross-brand orchestrator
CREATE OR REPLACE FUNCTION public.escalate_all_brands_breached_tickets()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand RECORD;
  v_brand_result jsonb;
  v_total integer := 0;
  v_results jsonb := '[]'::jsonb;
BEGIN
  FOR v_brand IN
    SELECT id, name FROM brands LIMIT 500
  LOOP
    v_brand_result := escalate_breached_tickets(v_brand.id);
    IF (v_brand_result->>'escalated_count')::int > 0 THEN
      v_total := v_total + (v_brand_result->>'escalated_count')::int;
      v_results := v_results || jsonb_build_object(
        'brand_id', v_brand.id,
        'brand_name', v_brand.name,
        'escalated_count', v_brand_result->>'escalated_count'
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'total_escalated', v_total,
    'brands', v_results,
    'checked_at', now()
  );
END;
$$;

-- Lock down: only service_role and admins can call
REVOKE EXECUTE ON FUNCTION public.escalate_breached_tickets(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.escalate_all_brands_breached_tickets() FROM anon, authenticated;

-- ============================================================
-- 6. AI Override Rate views (security_invoker → respect RLS)
-- ============================================================
CREATE OR REPLACE VIEW public.v_ai_override_rate_30d
WITH (security_invoker = true) AS
SELECT
  brand_id,
  date_trunc('day', created_at)::date AS day,
  COUNT(*) AS total_decisions,
  COUNT(*) FILTER (WHERE was_overridden) AS overridden_decisions,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE was_overridden)::numeric
    / NULLIF(COUNT(*), 0),
    2
  ) AS override_rate_pct,
  ROUND(AVG(confidence)::numeric, 3) AS avg_confidence,
  ROUND(AVG(confidence) FILTER (WHERE was_overridden)::numeric, 3)
    AS avg_confidence_when_overridden
FROM public.ai_decision_logs
WHERE created_at >= now() - interval '30 days'
GROUP BY brand_id, date_trunc('day', created_at)
ORDER BY day DESC;

CREATE OR REPLACE VIEW public.v_ai_proposal_outcomes_30d
WITH (security_invoker = true) AS
SELECT
  d.brand_id,
  date_trunc('day', d.decided_at)::date AS day,
  d.decision,
  COUNT(*) AS cnt
FROM public.ai_call_action_decisions d
WHERE d.decided_at >= now() - interval '30 days'
GROUP BY d.brand_id, date_trunc('day', d.decided_at), d.decision
ORDER BY day DESC;

-- Grant to authenticated; RLS on underlying tables enforces brand isolation
GRANT SELECT ON public.v_ai_override_rate_30d TO authenticated;
GRANT SELECT ON public.v_ai_proposal_outcomes_30d TO authenticated;

-- ============================================================
-- 7. Aggregate RPC for dashboard (admin/responsabile only)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_ai_override_summary(
  p_brand_id uuid DEFAULT NULL,
  p_days integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_user_id uuid;
  v_total integer := 0;
  v_overridden integer := 0;
  v_avg_conf numeric;
  v_avg_conf_overridden numeric;
  v_top_categories jsonb;
  v_proposals_total integer := 0;
  v_proposals_approved integer := 0;
  v_proposals_rejected integer := 0;
  v_proposals_edited integer := 0;
BEGIN
  v_user_id := get_user_id(auth.uid());
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  -- Permission check: must be admin or CEO or responsabile_venditori for this brand
  IF p_brand_id IS NOT NULL THEN
    IF NOT (
      has_role(v_user_id, 'ceo'::app_role)
      OR has_role_for_brand(v_user_id, p_brand_id, 'admin'::app_role)
      OR has_role_for_brand(v_user_id, p_brand_id, 'responsabile_venditori'::app_role)
      OR has_role_for_brand(v_user_id, p_brand_id, 'responsabile_callcenter'::app_role)
    ) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  ELSE
    IF NOT has_role(v_user_id, 'ceo'::app_role) AND NOT has_role(v_user_id, 'admin'::app_role) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  -- AI decision logs aggregation
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE was_overridden),
    ROUND(AVG(confidence)::numeric, 3),
    ROUND(AVG(confidence) FILTER (WHERE was_overridden)::numeric, 3)
  INTO v_total, v_overridden, v_avg_conf, v_avg_conf_overridden
  FROM ai_decision_logs
  WHERE created_at >= now() - (p_days || ' days')::interval
    AND (p_brand_id IS NULL OR brand_id = p_brand_id);

  -- Top override categories
  SELECT COALESCE(jsonb_agg(c ORDER BY c.cnt DESC), '[]'::jsonb)
  INTO v_top_categories
  FROM (
    SELECT override_reason_category::text AS category, COUNT(*) AS cnt
    FROM ai_decision_logs
    WHERE was_overridden = true
      AND override_reason_category IS NOT NULL
      AND created_at >= now() - (p_days || ' days')::interval
      AND (p_brand_id IS NULL OR brand_id = p_brand_id)
    GROUP BY override_reason_category
    ORDER BY COUNT(*) DESC
    LIMIT 10
  ) c;

  -- AI call-action proposal outcomes
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE decision::text = 'approved'),
    COUNT(*) FILTER (WHERE decision::text = 'rejected'),
    COUNT(*) FILTER (WHERE decision::text = 'edited')
  INTO v_proposals_total, v_proposals_approved, v_proposals_rejected, v_proposals_edited
  FROM ai_call_action_decisions
  WHERE decided_at >= now() - (p_days || ' days')::interval
    AND (p_brand_id IS NULL OR brand_id = p_brand_id);

  RETURN jsonb_build_object(
    'period_days', p_days,
    'brand_id', p_brand_id,
    'decisions', jsonb_build_object(
      'total', v_total,
      'overridden', v_overridden,
      'override_rate_pct', ROUND(100.0 * v_overridden / NULLIF(v_total, 0), 2),
      'avg_confidence', v_avg_conf,
      'avg_confidence_when_overridden', v_avg_conf_overridden,
      'top_override_categories', v_top_categories
    ),
    'proposals', jsonb_build_object(
      'total', v_proposals_total,
      'approved', v_proposals_approved,
      'rejected', v_proposals_rejected,
      'edited', v_proposals_edited,
      'approval_rate_pct', ROUND(100.0 * v_proposals_approved / NULLIF(v_proposals_total, 0), 2)
    ),
    'generated_at', now()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_ai_override_summary(uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_ai_override_summary(uuid, integer) TO authenticated;