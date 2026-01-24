import { Badge } from "@/components/ui/badge";
import { TicketStatus } from "@/hooks/useTickets";

const statusConfig: Record<TicketStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  open: { label: "Aperto", variant: "destructive" },
  in_progress: { label: "In Lavorazione", variant: "default" },
  resolved: { label: "Risolto", variant: "secondary" },
  closed: { label: "Chiuso", variant: "outline" },
  reopened: { label: "Riaperto", variant: "destructive" },
};

interface TicketStatusBadgeProps {
  status: TicketStatus;
}

export function TicketStatusBadge({ status }: TicketStatusBadgeProps) {
  const config = statusConfig[status];
  
  return (
    <Badge variant={config.variant}>
      {config.label}
    </Badge>
  );
}
