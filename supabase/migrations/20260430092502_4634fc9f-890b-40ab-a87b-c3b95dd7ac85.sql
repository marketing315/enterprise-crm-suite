CREATE OR REPLACE FUNCTION public.get_ticket_escalation_audit(
  p_brand_id uuid DEFAULT NULL,
  p_level integer DEFAULT NULL,
  p_from timestamptz DEFAULT (now() - interval '30 days'),
  p_to timestamptz DEFAULT now(),
  p_limit integer DEFAULT 200
)
RETURNS TABLE (
  audit_id uuid,
  ticket_id uuid,
  ticket_title text,
  ticket_status text,
  ticket_priority integer,
  brand_id uuid,
  escalation_level integer,
  previous_level integer,
  minutes_since_breach integer,
  escalated_at timestamptz,
  sla_breached_at timestamptz,
  escalated_to_user_id uuid,
  escalated_to_name text,
  notification_id uuid,
  notification_read_at timestamptz,
  suggestion_id uuid,
  suggestion_acted_on_at timestamptz,
  suggestion_dismissed_at timestamptz,
  outcome text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      tal.id AS audit_id,
      tal.ticket_id,
      tal.brand_id,
      tal.created_at AS escalated_at,
      COALESCE((tal.new_value->>'escalation_level')::int, 0) AS escalation_level,
      COALESCE((tal.metadata->>'previous_level')::int, 0) AS previous_level,
      COALESCE((tal.metadata->>'minutes_since_breach')::int, 0) AS minutes_since_breach,
      NULLIF(tal.metadata->>'escalated_to_user_id','')::uuid AS escalated_to_user_id
    FROM public.ticket_audit_logs tal
    WHERE tal.action_type = 'sla_escalation'
      AND tal.created_at BETWEEN p_from AND p_to
      AND (p_brand_id IS NULL OR tal.brand_id = p_brand_id)
      AND (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR public.has_role(auth.uid(), 'ceo'::app_role)
        OR public.user_belongs_to_brand(public.get_user_id(auth.uid()), tal.brand_id)
      )
  )
  SELECT
    b.audit_id,
    b.ticket_id,
    t.title AS ticket_title,
    t.status::text AS ticket_status,
    t.priority AS ticket_priority,
    b.brand_id,
    b.escalation_level,
    b.previous_level,
    b.minutes_since_breach,
    b.escalated_at,
    t.sla_breached_at,
    b.escalated_to_user_id,
    u.full_name AS escalated_to_name,
    n.id AS notification_id,
    n.read_at AS notification_read_at,
    s.id AS suggestion_id,
    s.acted_on_at AS suggestion_acted_on_at,
    s.dismissed_at AS suggestion_dismissed_at,
    CASE
      WHEN s.acted_on_at IS NOT NULL THEN 'risolto'
      WHEN s.dismissed_at IS NOT NULL THEN 'ignorato'
      WHEN n.read_at IS NOT NULL THEN 'visto'
      WHEN b.escalated_to_user_id IS NULL THEN 'no_manager'
      ELSE 'pending'
    END AS outcome
  FROM base b
  LEFT JOIN public.tickets t ON t.id = b.ticket_id
  LEFT JOIN public.users u ON u.id = b.escalated_to_user_id
  LEFT JOIN LATERAL (
    SELECT n.id, n.read_at
    FROM public.notifications n
    WHERE n.entity_type = 'ticket'
      AND n.entity_id = b.ticket_id
      AND n.type = 'ticket_escalated'
      AND n.user_id = b.escalated_to_user_id
      AND n.created_at BETWEEN b.escalated_at - interval '5 minutes' AND b.escalated_at + interval '5 minutes'
    ORDER BY n.created_at DESC
    LIMIT 1
  ) n ON true
  LEFT JOIN LATERAL (
    SELECT s.id, s.acted_on_at, s.dismissed_at
    FROM public.action_suggestions s
    WHERE s.entity_type = 'ticket'
      AND s.entity_id = b.ticket_id
      AND s.suggestion_type = 'escalate'
      AND s.user_id = b.escalated_to_user_id
      AND s.created_at BETWEEN b.escalated_at - interval '5 minutes' AND b.escalated_at + interval '5 minutes'
    ORDER BY s.created_at DESC
    LIMIT 1
  ) s ON true
  WHERE (p_level IS NULL OR b.escalation_level = p_level)
  ORDER BY b.escalated_at DESC
  LIMIT LEAST(COALESCE(p_limit, 200), 500);
$$;

REVOKE EXECUTE ON FUNCTION public.get_ticket_escalation_audit(uuid, integer, timestamptz, timestamptz, integer) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ticket_escalation_audit(uuid, integer, timestamptz, timestamptz, integer) TO authenticated;