import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type EscalationOutcome = "risolto" | "ignorato" | "visto" | "pending" | "no_manager";

export interface TicketEscalationAuditRow {
  audit_id: string;
  ticket_id: string;
  ticket_title: string | null;
  ticket_status: string | null;
  ticket_priority: number | null;
  brand_id: string;
  escalation_level: number;
  previous_level: number;
  minutes_since_breach: number;
  escalated_at: string;
  sla_breached_at: string | null;
  escalated_to_user_id: string | null;
  escalated_to_name: string | null;
  notification_id: string | null;
  notification_read_at: string | null;
  suggestion_id: string | null;
  suggestion_acted_on_at: string | null;
  suggestion_dismissed_at: string | null;
  outcome: EscalationOutcome;
}

export interface TicketEscalationAuditFilters {
  brandId?: string | null;
  level?: number | null;
  fromDays?: number;
  limit?: number;
}

export function useTicketEscalationAudit(filters: TicketEscalationAuditFilters = {}) {
  const { brandId, level, fromDays = 30, limit = 200 } = filters;

  return useQuery({
    queryKey: ["ticket-escalation-audit", brandId ?? null, level ?? null, fromDays, limit],
    queryFn: async () => {
      const from = new Date(Date.now() - fromDays * 24 * 60 * 60 * 1000).toISOString();
      const to = new Date().toISOString();

      const { data, error } = await supabase.rpc("get_ticket_escalation_audit", {
        p_brand_id: brandId ?? undefined,
        p_level: level ?? undefined,
        p_from: from,
        p_to: to,
        p_limit: limit,
      });

      if (error) throw error;
      return (data ?? []) as TicketEscalationAuditRow[];
    },
    staleTime: 60_000,
  });
}
