import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type TicketAuditAction = 
  | "created" 
  | "status_change" 
  | "assignment_change" 
  | "priority_change" 
  | "category_change" 
  | "comment_added";

export interface TicketAuditLog {
  id: string;
  ticket_id: string;
  brand_id: string;
  user_id: string | null;
  action_type: TicketAuditAction;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  users: {
    id: string;
    full_name: string | null;
    email: string;
  } | null;
}

export function useTicketAuditLogs(ticketId: string | null) {
  return useQuery({
    queryKey: ["ticket-audit-logs", ticketId],
    queryFn: async () => {
      if (!ticketId) return [];

      const { data, error } = await supabase
        .from("ticket_audit_logs")
        .select(`
          *,
          users:user_id (id, full_name, email)
        `)
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as unknown as TicketAuditLog[];
    },
    enabled: !!ticketId,
  });
}

export function useLatestTicketAudit(ticketId: string | null) {
  return useQuery({
    queryKey: ["ticket-latest-audit", ticketId],
    queryFn: async () => {
      if (!ticketId) return null;

      const { data, error } = await supabase
        .from("ticket_audit_logs")
        .select(`
          *,
          users:user_id (id, full_name, email)
        `)
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data as unknown as TicketAuditLog | null;
    },
    enabled: !!ticketId,
  });
}
