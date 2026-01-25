import { useState, useMemo } from "react";
import { Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TicketsTable } from "@/components/tickets/TicketsTable";
import { TicketDetailSheet } from "@/components/tickets/TicketDetailSheet";
import { TicketFilters, AssignmentTypeFilter } from "@/components/tickets/TicketFilters";
import { TicketQueueTabs } from "@/components/tickets/TicketQueueTabs";
import { useTickets, TicketStatus, TicketWithRelations, useAssignTicket } from "@/hooks/useTickets";
import { useTicketQueue } from "@/hooks/useTicketQueue";
import { useAuth } from "@/contexts/AuthContext";
import { useBrandOperators } from "@/hooks/useBrandOperators";
import { toast } from "sonner";

export default function Tickets() {
  // Advanced filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [assignmentTypeFilter, setAssignmentTypeFilter] = useState<AssignmentTypeFilter>("all");
  
  // Detail sheet
  const [selectedTicket, setSelectedTicket] = useState<TicketWithRelations | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { supabaseUser, hasRole } = useAuth();
  const { data: allTickets = [], isLoading } = useTickets();
  const { data: operators = [] } = useBrandOperators();
  const assignTicket = useAssignTicket();

  // Get current user's operator ID
  const currentOperator = operators.find(
    (op) => op.supabase_auth_id === supabaseUser?.id
  );

  const isOperator = hasRole("callcenter") || hasRole("admin");

  // Queue tabs with smart sorting
  const {
    activeTab,
    setActiveTab,
    filteredTickets: queueFilteredTickets,
    counts,
  } = useTicketQueue({
    tickets: allTickets,
    currentUserId: currentOperator?.user_id ?? null,
    isOperator,
  });

  // Apply additional filters on top of queue filter
  const filteredTickets = useMemo(() => {
    let result = queueFilteredTickets;

    // Search filter (name, email, phone, title, description)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter((ticket) => {
        const contactName = `${ticket.contacts?.first_name || ""} ${ticket.contacts?.last_name || ""}`.toLowerCase();
        const contactEmail = ticket.contacts?.email?.toLowerCase() || "";
        const title = ticket.title.toLowerCase();
        const description = ticket.description?.toLowerCase() || "";
        
        return (
          contactName.includes(query) ||
          contactEmail.includes(query) ||
          title.includes(query) ||
          description.includes(query)
        );
      });
    }

    // Tag/Category filter
    if (selectedTagIds.length > 0) {
      result = result.filter(
        (ticket) => ticket.category_tag_id && selectedTagIds.includes(ticket.category_tag_id)
      );
    }

    // Assignment type filter (auto vs manual)
    if (assignmentTypeFilter === "auto") {
      result = result.filter(
        (ticket) => ticket.assigned_at && !ticket.assigned_by_user_id
      );
    } else if (assignmentTypeFilter === "manual") {
      result = result.filter((ticket) => ticket.assigned_by_user_id);
    }

    return result;
  }, [queueFilteredTickets, searchQuery, selectedTagIds, assignmentTypeFilter]);

  // Counts for assignment type filter
  const autoCount = useMemo(
    () => queueFilteredTickets.filter((t) => t.assigned_at && !t.assigned_by_user_id).length,
    [queueFilteredTickets]
  );
  const manualCount = useMemo(
    () => queueFilteredTickets.filter((t) => t.assigned_by_user_id).length,
    [queueFilteredTickets]
  );

  const handleTicketClick = (ticket: TicketWithRelations) => {
    setSelectedTicket(ticket);
    setSheetOpen(true);
  };

  const handleTakeOwnership = async (ticket: TicketWithRelations, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentOperator) {
      toast.error("Non sei autorizzato ad assegnare ticket");
      return;
    }
    try {
      await assignTicket.mutateAsync({ 
        ticketId: ticket.id, 
        userId: currentOperator.user_id 
      });
      toast.success("Ticket preso in carico");
    } catch {
      toast.error("Errore nell'assegnazione");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Ticket className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Ticket</h1>
            <p className="text-muted-foreground">
              Gestisci le richieste di assistenza
            </p>
          </div>
        </div>
      </div>

      {/* Queue Tabs */}
      <TicketQueueTabs
        value={activeTab}
        onChange={setActiveTab}
        counts={counts}
        showMyQueue={isOperator}
      />

      {/* Advanced Filters (simplified - removed assignee since handled by tabs) */}
      <TicketFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedTagIds={selectedTagIds}
        onTagsChange={setSelectedTagIds}
        assigneeFilter="all"
        onAssigneeChange={() => {}}
        operators={operators}
        assignmentTypeFilter={assignmentTypeFilter}
        onAssignmentTypeChange={setAssignmentTypeFilter}
        autoCount={autoCount}
        manualCount={manualCount}
        hideAssigneeFilter={activeTab !== "all"}
      />

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : (
        <TicketsTable 
          tickets={filteredTickets} 
          onTicketClick={handleTicketClick}
          onTakeOwnership={currentOperator ? handleTakeOwnership : undefined}
          showSlaIndicator
        />
      )}

      {/* Detail Sheet */}
      <TicketDetailSheet
        ticket={selectedTicket}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </div>
  );
}
