import { useState } from "react";
import { Ticket, Filter } from "lucide-react";
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
import { useTickets, TicketStatus, TicketWithRelations } from "@/hooks/useTickets";

export default function Tickets() {
  const [statusFilter, setStatusFilter] = useState<TicketStatus | "all">("all");
  const [selectedTicket, setSelectedTicket] = useState<TicketWithRelations | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data: tickets = [], isLoading } = useTickets(
    statusFilter === "all" ? undefined : statusFilter
  );

  const handleTicketClick = (ticket: TicketWithRelations) => {
    setSelectedTicket(ticket);
    setSheetOpen(true);
  };

  const statusCounts = {
    all: tickets.length,
    open: tickets.filter((t) => t.status === "open").length,
    in_progress: tickets.filter((t) => t.status === "in_progress").length,
    resolved: tickets.filter((t) => t.status === "resolved").length,
    closed: tickets.filter((t) => t.status === "closed").length,
    reopened: tickets.filter((t) => t.status === "reopened").length,
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

      {/* Quick Stats */}
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
      <div className="flex items-center gap-4">
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
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : (
        <TicketsTable tickets={tickets} onTicketClick={handleTicketClick} />
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
