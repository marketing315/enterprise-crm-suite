import { format } from "date-fns";
import { it } from "date-fns/locale";
import { User, Mail, Clock, DollarSign } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { DealWithContact } from "@/types/database";

interface KanbanCardPreviewProps {
  deal: DealWithContact;
}

/**
 * A simplified card preview used in DragOverlay.
 * Does not include sortable hooks or forwardRef to avoid React warnings.
 */
export function KanbanCardPreview({ deal }: KanbanCardPreviewProps) {
  const getFullName = () => {
    const parts = [deal.contact?.first_name, deal.contact?.last_name].filter(Boolean);
    return parts.length > 0 ? parts.join(" ") : "Senza nome";
  };

  const statusColors: Record<string, string> = {
    open: "bg-primary/10 text-primary",
    won: "bg-green-500/10 text-green-700",
    lost: "bg-destructive/10 text-destructive",
    closed: "bg-muted text-muted-foreground",
    reopened_for_support: "bg-amber-500/10 text-amber-700",
  };

  return (
    <Card className="cursor-grabbing shadow-lg w-72 max-w-full">
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
          <div className="flex items-center gap-2 text-xs font-medium text-primary">
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
