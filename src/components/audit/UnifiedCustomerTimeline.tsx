import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Loader2, Phone, Calendar, FileText, Tag as TagIcon, Briefcase, Ticket as TicketIcon, User } from "lucide-react";
import { useUnifiedCustomerTimeline } from "@/hooks/useUnifiedCustomerTimeline";
import { AuditActionTag } from "./AuditActionTag";
import { AuditActorBadge } from "./AuditActorBadge";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface UnifiedCustomerTimelineProps {
  contactId: string | null;
}

const entityIcons: Record<string, React.ElementType> = {
  contact: User,
  deal: Briefcase,
  ticket: TicketIcon,
  appointment: Calendar,
  tag_assignment: TagIcon,
  call_log: Phone,
  note: FileText,
};

const entityLabels: Record<string, string> = {
  contact: "Contatto",
  deal: "Deal",
  ticket: "Ticket",
  appointment: "Appuntamento",
  tag_assignment: "Tag",
  call_log: "Chiamata",
  note: "Nota",
};

export function UnifiedCustomerTimeline({ contactId }: UnifiedCustomerTimelineProps) {
  const { data: events = [], isLoading } = useUnifiedCustomerTimeline(contactId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        Nessun evento registrato sul cliente
      </p>
    );
  }

  return (
    <div className="relative">
      <div className="absolute left-3 top-0 bottom-0 w-px bg-border" />
      <div className="space-y-0">
        {events.map(event => {
          const Icon = entityIcons[event.entity_type] || User;
          const entityLabel = entityLabels[event.entity_type] || event.entity_type;

          return (
            <div
              key={event.event_id}
              className={cn(
                "relative pl-8 py-3 hover:bg-muted/50 rounded-md transition-colors"
              )}
            >
              <div className="absolute left-[7px] top-4 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-background" />
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-1.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs flex items-center gap-1">
                      <Icon className="h-3 w-3" />
                      {entityLabel}
                    </Badge>
                    <AuditActionTag action={event.action} />
                    <AuditActorBadge
                      actorType="user"
                      displayName={event.actor_display_name}
                    />
                  </div>
                  {event.summary && (
                    <p className="text-xs text-muted-foreground">{event.summary}</p>
                  )}
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                  {format(new Date(event.occurred_at), "dd MMM HH:mm", { locale: it })}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
