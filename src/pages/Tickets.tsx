import { useState, useMemo } from "react";
import { Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TicketsTable } from "@/components/tickets/TicketsTable";
import { TicketDetailSheet } from "@/components/tickets/TicketDetailSheet";
import { TicketFilters, AssignmentTypeFilter } from "@/components/tickets/TicketFilters";
import { useTickets, TicketStatus, TicketWithRelations, useAssignTicket } from "@/hooks/useTickets";
import { useAuth } from "@/contexts/AuthContext";
import { useBrandOperators } from "@/hooks/useBrandOperators";
import { toast } from "sonner";

export default function Tickets() {
  // Status filter
  const [statusFilter, setStatusFilter] = useState<TicketStatus | "all">("all");
  
  // Advanced filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [assignmentTypeFilter, setAssignmentTypeFilter] = useState<AssignmentTypeFilter>("all");
  
  // Detail sheet
  const [selectedTicket, setSelectedTicket] = useState<TicketWithRelations | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { supabaseUser } = useAuth();
  const { data: allTickets = [], isLoading } = useTickets(
    statusFilter === "all" ? undefined : statusFilter
  );
  const { data: operators = [] } = useBrandOperators();
  const assignTicket = useAssignTicket();

  // Get current user's operator ID
  const currentOperator = operators.find(
    (op) => op.supabase_auth_id === supabaseUser?.id
  );

  // Apply all filters
  const filteredTickets = useMemo(() => {
    let result = allTickets;

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

    // Assignee filter
    if (assigneeFilter === "unassigned") {
      result = result.filter((ticket) => !ticket.assigned_to_user_id);
    } else if (assigneeFilter !== "all") {
      result = result.filter((ticket) => ticket.assigned_to_user_id === assigneeFilter);
    }

    // Assignment type filter (auto vs manual)
    if (assignmentTypeFilter === "auto") {
      // Auto-assigned: has assigned_at but no assigned_by_user_id
      result = result.filter(
        (ticket) => ticket.assigned_at && !ticket.assigned_by_user_id
      );
    } else if (assignmentTypeFilter === "manual") {
      // Manual: has assigned_by_user_id
      result = result.filter((ticket) => ticket.assigned_by_user_id);
    }

    return result;
  }, [allTickets, searchQuery, selectedTagIds, assigneeFilter, assignmentTypeFilter]);

  // Counts for filters
  const statusCounts = useMemo(() => ({
    all: allTickets.length,
    open: allTickets.filter((t) => t.status === "open").length,
    in_progress: allTickets.filter((t) => t.status === "in_progress").length,
    resolved: allTickets.filter((t) => t.status === "resolved").length,
    closed: allTickets.filter((t) => t.status === "closed").length,
    reopened: allTickets.filter((t) => t.status === "reopened").length,
  }), [allTickets]);

  const autoCount = useMemo(
    () => allTickets.filter((t) => t.assigned_at && !t.assigned_by_user_id).length,
    [allTickets]
  );
  const manualCount = useMemo(
    () => allTickets.filter((t) => t.assigned_by_user_id).length,
    [allTickets]
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

      {/* Quick Stats - Status */}
      <div className="flex gap-4 flex-wrap">
        <Button
          variant={statusFilter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setStatusFilter("all")}
        >
          Tutti ({statusCounts.all})
        </Button>
        <Button
          variant={statusFilter === "open" ? "default" : "outline"}
          size="sm"
          onClick={() => setStatusFilter("open")}
        >
          Aperti ({statusCounts.open})
        </Button>
        <Button
          variant={statusFilter === "in_progress" ? "default" : "outline"}
          size="sm"
          onClick={() => setStatusFilter("in_progress")}
        >
          In Lavorazione ({statusCounts.in_progress})
        </Button>
        <Button
          variant={statusFilter === "resolved" ? "default" : "outline"}
          size="sm"
          onClick={() => setStatusFilter("resolved")}
        >
          Risolti ({statusCounts.resolved})
        </Button>
        <Button
          variant={statusFilter === "reopened" ? "default" : "outline"}
          size="sm"
          onClick={() => setStatusFilter("reopened")}
        >
          Riaperti ({statusCounts.reopened})
        </Button>
      </div>

      {/* Advanced Filters */}
      <TicketFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedTagIds={selectedTagIds}
        onTagsChange={setSelectedTagIds}
        assigneeFilter={assigneeFilter}
        onAssigneeChange={setAssigneeFilter}
        operators={operators}
        assignmentTypeFilter={assignmentTypeFilter}
        onAssignmentTypeChange={setAssignmentTypeFilter}
        autoCount={autoCount}
        manualCount={manualCount}
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
