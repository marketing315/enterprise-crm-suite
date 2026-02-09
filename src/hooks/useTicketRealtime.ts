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

// Helper: check if a brand_id belongs to the current view
function isBrandInScope(
  brandId: string,
  isAllBrandsSelected: boolean,
  allBrandIds: string[],
  currentBrandId?: string
): boolean {
  if (isAllBrandsSelected) {
    return allBrandIds.includes(brandId);
  }
  return brandId === currentBrandId;
}

/**
 * Hook for realtime ticket notifications.
 * Subscribes to tickets and ticket_comments changes for the current brand(s).
 * In "Azienda Intera" view, subscribes to ALL brand tickets.
 */
export function useTicketRealtime(
  onNewTicket?: () => void,
  onAssignedToMe?: (ticketTitle: string) => void
): TicketNotificationState & { resetCounts: () => void } {
  const queryClient = useQueryClient();
  const { currentBrand, isAllBrandsSelected, allBrandIds } = useBrand();
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
        if (!isBrandInScope(newTicket.brand_id, isAllBrandsSelected, allBrandIds, currentBrand?.id)) return;

        setNotificationState((prev) => ({
          ...prev,
          newTicketsCount: prev.newTicketsCount + 1,
        }));

        // Invalidate all relevant ticket queries
        queryClient.invalidateQueries({ queryKey: ["tickets"] });
        queryClient.invalidateQueries({ queryKey: ["tickets-search"] });
        queryClient.invalidateQueries({ queryKey: ["ticket-queue-counts"] });

        toast.info("Nuovo ticket", {
          description: newTicket.title || "Un nuovo ticket è stato creato",
        });

        onNewTicket?.();
      }

      // UPDATE event
      if (payload.eventType === "UPDATE" && newTicket && oldTicket) {
        if (!isBrandInScope(newTicket.brand_id, isAllBrandsSelected, allBrandIds, currentBrand?.id)) return;

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

        queryClient.invalidateQueries({ queryKey: ["tickets"] });
        queryClient.invalidateQueries({ queryKey: ["tickets-search"] });
        queryClient.invalidateQueries({ queryKey: ["ticket", newTicket.id] });
        queryClient.invalidateQueries({ queryKey: ["ticket-queue-counts"] });
      }
    },
    [currentBrand?.id, isAllBrandsSelected, allBrandIds, myUserId, queryClient, onNewTicket, onAssignedToMe]
  );

  const handleCommentChange = useCallback(
    (payload: RealtimePostgresChangesPayload<CommentRow>) => {
      const newComment = payload.new as CommentRow | undefined;

      if (payload.eventType === "INSERT" && newComment) {
        if (!isBrandInScope(newComment.brand_id, isAllBrandsSelected, allBrandIds, currentBrand?.id)) return;

        queryClient.invalidateQueries({
          queryKey: ["ticket-comments", newComment.ticket_id],
        });
      }
    },
    [currentBrand?.id, isAllBrandsSelected, allBrandIds, queryClient]
  );

  const handleAuditLogChange = useCallback(
    async (payload: RealtimePostgresChangesPayload<AuditLogRow>) => {
      const newLog = payload.new as AuditLogRow | undefined;

      // Only handle SLA breach events
      if (payload.eventType === "INSERT" && newLog && newLog.action_type === "sla_breach") {
        if (!isBrandInScope(newLog.brand_id, isAllBrandsSelected, allBrandIds, currentBrand?.id)) return;

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
        queryClient.invalidateQueries({ queryKey: ["tickets"] });
        queryClient.invalidateQueries({ queryKey: ["tickets-search"] });
        queryClient.invalidateQueries({ queryKey: ["ticket", newLog.ticket_id] });
        queryClient.invalidateQueries({ queryKey: ["ticket-audit-logs", newLog.ticket_id] });
        queryClient.invalidateQueries({ queryKey: ["ticket-queue-counts"] });
      }
    },
    [currentBrand?.id, isAllBrandsSelected, allBrandIds, myUserId, queryClient]
  );

  useEffect(() => {
    if (!currentBrand?.id) return;

    // Reset notification counts when brand changes
    resetCounts();

    // In global view, subscribe without brand filter to catch all brands' events.
    // In single brand view, use a brand filter for efficiency.
    const brandFilter = isAllBrandsSelected
      ? undefined
      : `brand_id=eq.${currentBrand.id}`;

    const channelSuffix = isAllBrandsSelected ? "all" : currentBrand.id;

    // Subscribe to tickets table
    const ticketsChannel = supabase
      .channel(`tickets-realtime-${channelSuffix}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tickets",
          ...(brandFilter ? { filter: brandFilter } : {}),
        },
        handleTicketChange
      )
      .subscribe();

    // Subscribe to ticket_comments table
    const commentsChannel = supabase
      .channel(`comments-realtime-${channelSuffix}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "ticket_comments",
          ...(brandFilter ? { filter: brandFilter } : {}),
        },
        handleCommentChange
      )
      .subscribe();

    // Subscribe to ticket_audit_logs for SLA breach notifications
    const auditChannel = supabase
      .channel(`audit-realtime-${channelSuffix}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "ticket_audit_logs",
          ...(brandFilter ? { filter: brandFilter } : {}),
        },
        handleAuditLogChange
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ticketsChannel);
      supabase.removeChannel(commentsChannel);
      supabase.removeChannel(auditChannel);
    };
  }, [currentBrand?.id, isAllBrandsSelected, handleTicketChange, handleCommentChange, handleAuditLogChange, resetCounts]);

  return { ...notificationState, resetCounts };
}
