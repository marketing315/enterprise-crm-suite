import { useState } from "react";
import { Ticket, Filter, UserCircle, Hand } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TicketsTable } from "@/components/tickets/TicketsTable";
import { TicketDetailSheet } from "@/components/tickets/TicketDetailSheet";
import { useTickets, TicketStatus, TicketWithRelations, useAssignTicket } from "@/hooks/useTickets";
import { useAuth } from "@/contexts/AuthContext";
import { useBrandOperators } from "@/hooks/useBrandOperators";
import { toast } from "sonner";

type AssignmentFilter = "all" | "unassigned" | "mine";

export default function Tickets() {
  const [statusFilter, setStatusFilter] = useState<TicketStatus | "all">("all");
  const [assignmentFilter, setAssignmentFilter] = useState<AssignmentFilter>("all");
  const [selectedTicket, setSelectedTicket] = useState<TicketWithRelations | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { supabaseUser } = useAuth();
  const { data: allTickets = [], isLoading } = useTickets(
    statusFilter === "all" ? undefined : statusFilter
  );
  const { data: operators = [] } = useBrandOperators();
  const assignTicket = useAssignTicket();

  // Get current user's operator ID using supabase_auth_id for reliable matching
  const currentOperator = operators.find(
    (op) => op.supabase_auth_id === supabaseUser?.id
  );

  // Apply assignment filter
  const tickets = allTickets.filter((ticket) => {
    if (assignmentFilter === "unassigned") {
      return !ticket.assigned_to_user_id;
    }
    if (assignmentFilter === "mine" && currentOperator) {
      return ticket.assigned_to_user_id === currentOperator.user_id;
    }
    return true;
  });

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

  const statusCounts = {
    all: allTickets.length,
    open: allTickets.filter((t) => t.status === "open").length,
    in_progress: allTickets.filter((t) => t.status === "in_progress").length,
    resolved: allTickets.filter((t) => t.status === "resolved").length,
    closed: allTickets.filter((t) => t.status === "closed").length,
    reopened: allTickets.filter((t) => t.status === "reopened").length,
  };

  const unassignedCount = allTickets.filter((t) => !t.assigned_to_user_id).length;
  const myTicketsCount = currentOperator
    ? allTickets.filter((t) => t.assigned_to_user_id === currentOperator.user_id).length
    : 0;

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

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Filtri:</span>
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as TicketStatus | "all")}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Stato" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti gli stati</SelectItem>
            <SelectItem value="open">Aperto</SelectItem>
            <SelectItem value="in_progress">In Lavorazione</SelectItem>
            <SelectItem value="resolved">Risolto</SelectItem>
            <SelectItem value="closed">Chiuso</SelectItem>
            <SelectItem value="reopened">Riaperto</SelectItem>
          </SelectContent>
        </Select>

        {/* Assignment Filters */}
        <div className="flex items-center gap-2 border-l pl-4">
          <UserCircle className="h-4 w-4 text-muted-foreground" />
          <Button
            variant={assignmentFilter === "all" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setAssignmentFilter("all")}
          >
            Tutti
          </Button>
          <Button
            variant={assignmentFilter === "unassigned" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setAssignmentFilter("unassigned")}
          >
            Non assegnati ({unassignedCount})
          </Button>
          {currentOperator && (
            <Button
              variant={assignmentFilter === "mine" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setAssignmentFilter("mine")}
            >
              I miei ({myTicketsCount})
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : (
        <TicketsTable 
          tickets={tickets} 
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
