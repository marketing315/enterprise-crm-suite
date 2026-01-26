import { useEffect, useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import { useAuth } from "@/contexts/AuthContext";
import { useBrandOperators } from "@/hooks/useBrandOperators";
import { toast } from "sonner";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

interface TicketRow {
  id: string;
  brand_id: string;
  assigned_to_user_id: string | null;
  status: string;
  title: string;
}

interface CommentRow {
  id: string;
  ticket_id: string;
  brand_id: string;
}

interface AuditLogRow {
  id: string;
  ticket_id: string;
  brand_id: string;
  action_type: string;
  new_value: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
}

export interface TicketNotificationState {
  newTicketsCount: number;
  myNewAssignmentsCount: number;
  slaBreachCount: number;
}

/**
 * Hook for realtime ticket notifications.
 * Subscribes to tickets and ticket_comments changes for the current brand.
 * Returns notification counts and provides automatic query invalidation.
 */
export function useTicketRealtime(
  onNewTicket?: () => void,
  onAssignedToMe?: (ticketTitle: string) => void
): TicketNotificationState & { resetCounts: () => void } {
  const queryClient = useQueryClient();
  const { currentBrand } = useBrand();
  const { supabaseUser } = useAuth();
  const { data: operators } = useBrandOperators();
  
  const [notificationState, setNotificationState] = useState<TicketNotificationState>({
    newTicketsCount: 0,
    myNewAssignmentsCount: 0,
    slaBreachCount: 0,
  });

  // Get current user's operator ID
  const currentOperator = operators?.find(
    (op) => op.supabase_auth_id === supabaseUser?.id
  );
  const myUserId = currentOperator?.user_id;

  const resetCounts = useCallback(() => {
    setNotificationState({
      newTicketsCount: 0,
      myNewAssignmentsCount: 0,
      slaBreachCount: 0,
    });
  }, []);

  const handleTicketChange = useCallback(
    (payload: RealtimePostgresChangesPayload<TicketRow>) => {
      const newTicket = payload.new as TicketRow | undefined;
      const oldTicket = payload.old as TicketRow | undefined;

      // INSERT event
      if (payload.eventType === "INSERT" && newTicket) {
        if (newTicket.brand_id !== currentBrand?.id) return;

        setNotificationState((prev) => ({
          ...prev,
          newTicketsCount: prev.newTicketsCount + 1,
        }));

        queryClient.invalidateQueries({ queryKey: ["tickets", currentBrand?.id] });

        toast.info("Nuovo ticket", {
          description: newTicket.title || "Un nuovo ticket è stato creato",
        });

        onNewTicket?.();
      }

      // UPDATE event
      if (payload.eventType === "UPDATE" && newTicket && oldTicket) {
        if (newTicket.brand_id !== currentBrand?.id) return;

        // Check if ticket was just assigned to me
        if (
          myUserId &&
          newTicket.assigned_to_user_id === myUserId &&
          oldTicket.assigned_to_user_id !== myUserId
        ) {
          setNotificationState((prev) => ({
            ...prev,
            myNewAssignmentsCount: prev.myNewAssignmentsCount + 1,
          }));

          toast.success("Ticket assegnato a te", {
            description: newTicket.title || "Un ticket è stato assegnato a te",
          });

          onAssignedToMe?.(newTicket.title);
        }

        queryClient.invalidateQueries({ queryKey: ["tickets", currentBrand?.id] });
        queryClient.invalidateQueries({ queryKey: ["ticket", newTicket.id] });
      }
    },
    [currentBrand?.id, myUserId, queryClient, onNewTicket, onAssignedToMe]
  );

  const handleCommentChange = useCallback(
    (payload: RealtimePostgresChangesPayload<CommentRow>) => {
      const newComment = payload.new as CommentRow | undefined;

      if (payload.eventType === "INSERT" && newComment) {
        if (newComment.brand_id !== currentBrand?.id) return;

        queryClient.invalidateQueries({
          queryKey: ["ticket-comments", newComment.ticket_id],
        });
      }
    },
    [currentBrand?.id, queryClient]
  );

  const handleAuditLogChange = useCallback(
    async (payload: RealtimePostgresChangesPayload<AuditLogRow>) => {
      const newLog = payload.new as AuditLogRow | undefined;

      // Only handle SLA breach events
      if (payload.eventType === "INSERT" && newLog && newLog.action_type === "sla_breach") {
        if (newLog.brand_id !== currentBrand?.id) return;

        // Fetch ticket to check assignment
        const { data: ticket } = await supabase
          .from("tickets")
          .select("id, title, assigned_to_user_id")
          .eq("id", newLog.ticket_id)
          .single();

        if (!ticket) return;

        // Notify only if ticket is assigned to me OR unassigned
        const isMyTicket = myUserId && ticket.assigned_to_user_id === myUserId;
        const isUnassigned = !ticket.assigned_to_user_id;

        if (isMyTicket || isUnassigned) {
          setNotificationState((prev) => ({
            ...prev,
            slaBreachCount: prev.slaBreachCount + 1,
          }));

          toast.warning("⚠️ SLA Breach", {
            description: isMyTicket
              ? `Il tuo ticket "${ticket.title}" ha superato la soglia SLA`
              : `Ticket non assegnato "${ticket.title}" ha superato la soglia SLA`,
          });
        }

        // Always invalidate queries to refresh the list
        queryClient.invalidateQueries({ queryKey: ["tickets", currentBrand?.id] });
        queryClient.invalidateQueries({ queryKey: ["ticket", newLog.ticket_id] });
        queryClient.invalidateQueries({ queryKey: ["ticket-audit-logs", newLog.ticket_id] });
      }
    },
    [currentBrand?.id, myUserId, queryClient]
  );

  useEffect(() => {
    if (!currentBrand?.id) return;

    // Reset notification counts when brand changes
    resetCounts();

    // Subscribe to tickets table
    const ticketsChannel = supabase
      .channel(`tickets-realtime-${currentBrand.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tickets",
          filter: `brand_id=eq.${currentBrand.id}`,
        },
        handleTicketChange
      )
      .subscribe();

    // Subscribe to ticket_comments table
    const commentsChannel = supabase
      .channel(`comments-realtime-${currentBrand.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "ticket_comments",
          filter: `brand_id=eq.${currentBrand.id}`,
        },
        handleCommentChange
      )
      .subscribe();

    // Subscribe to ticket_audit_logs for SLA breach notifications
    const auditChannel = supabase
      .channel(`audit-realtime-${currentBrand.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "ticket_audit_logs",
          filter: `brand_id=eq.${currentBrand.id}`,
        },
        handleAuditLogChange
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ticketsChannel);
      supabase.removeChannel(commentsChannel);
      supabase.removeChannel(auditChannel);
    };
  }, [currentBrand?.id, handleTicketChange, handleCommentChange, handleAuditLogChange, resetCounts]);

  return { ...notificationState, resetCounts };
}
