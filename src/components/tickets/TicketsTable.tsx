import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import { User, Clock, Hand } from "lucide-react";
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
import { TicketStatusBadge } from "./TicketStatusBadge";
import { TicketPriorityBadge } from "./TicketPriorityBadge";
import { TicketWithRelations } from "@/hooks/useTickets";

interface TicketsTableProps {
  tickets: TicketWithRelations[];
  onTicketClick: (ticket: TicketWithRelations) => void;
  onTakeOwnership?: (ticket: TicketWithRelations, e: React.MouseEvent) => void;
}

export function TicketsTable({ tickets, onTicketClick, onTakeOwnership }: TicketsTableProps) {
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

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
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
              <TableCell colSpan={onTakeOwnership ? 8 : 7} className="text-center py-8 text-muted-foreground">
                Nessun ticket trovato
              </TableCell>
            </TableRow>
          ) : (
            tickets.map((ticket) => (
              <TableRow
                key={ticket.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => onTicketClick(ticket)}
              >
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
                  <div className="flex items-center gap-1.5 text-muted-foreground">
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
