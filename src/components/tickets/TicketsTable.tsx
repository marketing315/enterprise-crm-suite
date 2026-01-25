import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import { User, Clock, Hand, AlertTriangle } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { TicketStatusBadge } from "./TicketStatusBadge";
import { TicketPriorityBadge } from "./TicketPriorityBadge";
import { TicketWithRelations } from "@/hooks/useTickets";
import { isSlaBreached } from "@/hooks/useTicketQueue";
import { SlaThresholds } from "@/hooks/useBrandSettings";
import { cn } from "@/lib/utils";

interface TicketsTableProps {
  tickets: TicketWithRelations[];
  onTicketClick: (ticket: TicketWithRelations) => void;
  onTakeOwnership?: (ticket: TicketWithRelations, e: React.MouseEvent) => void;
  showSlaIndicator?: boolean;
  slaThresholds?: SlaThresholds;
  // Bulk selection
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  showCheckboxes?: boolean;
}

export function TicketsTable({ 
  tickets, 
  onTicketClick, 
  onTakeOwnership, 
  showSlaIndicator = false,
  slaThresholds,
  selectedIds = new Set(),
  onSelectionChange,
  showCheckboxes = false,
}: TicketsTableProps) {
  const getContactName = (ticket: TicketWithRelations) => {
    if (!ticket.contacts) return "—";
    const { first_name, last_name, email } = ticket.contacts;
    if (first_name || last_name) {
      return `${first_name || ""} ${last_name || ""}`.trim();
    }
    return email || "—";
  };

  const getAging = (openedAt: string) => {
    return formatDistanceToNow(new Date(openedAt), { locale: it, addSuffix: false });
  };

  const allSelected = tickets.length > 0 && tickets.every((t) => selectedIds.has(t.id));
  const someSelected = tickets.some((t) => selectedIds.has(t.id)) && !allSelected;

  const handleSelectAll = (checked: boolean) => {
    if (!onSelectionChange) return;
    if (checked) {
      const newSet = new Set(selectedIds);
      tickets.forEach((t) => newSet.add(t.id));
      onSelectionChange(newSet);
    } else {
      const newSet = new Set(selectedIds);
      tickets.forEach((t) => newSet.delete(t.id));
      onSelectionChange(newSet);
    }
  };

  const handleSelectOne = (ticketId: string, checked: boolean) => {
    if (!onSelectionChange) return;
    const newSet = new Set(selectedIds);
    if (checked) {
      newSet.add(ticketId);
    } else {
      newSet.delete(ticketId);
    }
    onSelectionChange(newSet);
  };

  const colSpan = (showCheckboxes ? 1 : 0) + 7 + (onTakeOwnership ? 1 : 0);

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {showCheckboxes && (
              <TableHead className="w-[40px]">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={handleSelectAll}
                  aria-label="Seleziona tutti"
                  className={cn(someSelected && "opacity-50")}
                />
              </TableHead>
            )}
            <TableHead className="w-[100px]">Stato</TableHead>
            <TableHead className="w-[60px]">Priorità</TableHead>
            <TableHead>Contatto</TableHead>
            <TableHead>Titolo</TableHead>
            <TableHead>Categoria</TableHead>
            <TableHead>Assegnato a</TableHead>
            <TableHead className="w-[120px]">Aging</TableHead>
            {onTakeOwnership && <TableHead className="w-[100px]">Azione</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {tickets.length === 0 ? (
            <TableRow>
              <TableCell colSpan={colSpan} className="text-center py-8 text-muted-foreground">
                Nessun ticket trovato
              </TableCell>
            </TableRow>
          ) : (
            tickets.map((ticket) => (
              <TableRow
                key={ticket.id}
                className={cn(
                  "cursor-pointer hover:bg-muted/50",
                  selectedIds.has(ticket.id) && "bg-muted/30"
                )}
                onClick={() => onTicketClick(ticket)}
              >
                {showCheckboxes && (
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedIds.has(ticket.id)}
                      onCheckedChange={(checked) => handleSelectOne(ticket.id, !!checked)}
                      aria-label={`Seleziona ticket ${ticket.title}`}
                    />
                  </TableCell>
                )}
                <TableCell>
                  <TicketStatusBadge status={ticket.status} />
                </TableCell>
                <TableCell>
                  <TicketPriorityBadge priority={ticket.priority} />
                </TableCell>
                <TableCell className="font-medium">
                  {getContactName(ticket)}
                </TableCell>
                <TableCell className="max-w-[200px] truncate">
                  {ticket.title}
                </TableCell>
                <TableCell>
                  {ticket.tags ? (
                    <Badge 
                      variant="outline"
                      style={{ 
                        borderColor: ticket.tags.color || undefined,
                        color: ticket.tags.color || undefined 
                      }}
                    >
                      {ticket.tags.name}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    {ticket.users ? (
                      <>
                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm">
                          {ticket.users.full_name || ticket.users.email}
                        </span>
                      </>
                    ) : (
                      <span className="text-sm text-muted-foreground">Non assegnato</span>
                    )}
                    {/* Auto-assigned badge: assigned_at exists but assigned_by_user_id is null */}
                    {ticket.assigned_at && !ticket.assigned_by_user_id && (
                      <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                        Auto
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className={cn(
                    "flex items-center gap-1.5",
                    showSlaIndicator && isSlaBreached(ticket, slaThresholds) && "text-destructive"
                  )}>
                    {showSlaIndicator && isSlaBreached(ticket, slaThresholds) && (
                      <AlertTriangle className="h-3.5 w-3.5" />
                    )}
                    <Clock className="h-3.5 w-3.5" />
                    <span className="text-sm">{getAging(ticket.opened_at)}</span>
                  </div>
                </TableCell>
                {onTakeOwnership && (
                  <TableCell>
                    {!ticket.assigned_to_user_id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => onTakeOwnership(ticket, e)}
                      >
                        <Hand className="h-3.5 w-3.5 mr-1" />
                        Prendi
                      </Button>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
