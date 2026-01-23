import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { User, Mail, Clock, DollarSign } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { DealWithContact } from "@/types/database";

interface KanbanCardProps {
  deal: DealWithContact;
  onClick?: () => void;
}

export function KanbanCard({ deal, onClick }: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: deal.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const getFullName = () => {
    const parts = [deal.contact?.first_name, deal.contact?.last_name].filter(Boolean);
    return parts.length > 0 ? parts.join(" ") : "Senza nome";
  };

  const statusColors: Record<string, string> = {
    open: "bg-blue-100 text-blue-800",
    won: "bg-green-100 text-green-800",
    lost: "bg-red-100 text-red-800",
    closed: "bg-gray-100 text-gray-800",
    reopened_for_support: "bg-amber-100 text-amber-800",
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow"
      onClick={onClick}
    >
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-medium truncate">
            <User className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="truncate">{getFullName()}</span>
          </div>
          <Badge variant="outline" className={statusColors[deal.status] || ""}>
            {deal.status === "open" ? "Aperto" : 
             deal.status === "won" ? "Vinto" :
             deal.status === "lost" ? "Perso" :
             deal.status === "closed" ? "Chiuso" : "Riaperto"}
          </Badge>
        </div>

        {deal.contact?.email && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Mail className="h-3 w-3 shrink-0" />
            <span className="truncate">{deal.contact.email}</span>
          </div>
        )}

        {deal.value && (
          <div className="flex items-center gap-2 text-xs font-medium text-green-600">
            <DollarSign className="h-3 w-3 shrink-0" />
            <span>€{deal.value.toLocaleString("it-IT")}</span>
          </div>
        )}

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-3 w-3 shrink-0" />
          <span>{format(new Date(deal.updated_at), "dd MMM HH:mm", { locale: it })}</span>
        </div>

        {deal.notes && (
          <p className="text-xs text-muted-foreground line-clamp-2 pt-1 border-t">
            {deal.notes}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
