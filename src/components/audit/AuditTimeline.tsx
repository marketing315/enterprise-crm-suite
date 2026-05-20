import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useEntityAuditEvents, type AuditEvent } from "@/hooks/useAuditEvents";
import { AuditActionTag } from "./AuditActionTag";
import { AuditActorBadge } from "./AuditActorBadge";
import { AuditDiffViewer } from "./AuditDiffViewer";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface AuditTimelineProps {
  entityType: string;
  entityId: string | null;
}

export function AuditTimeline({ entityType, entityId }: AuditTimelineProps) {
  const { data: events = [], isLoading } = useEntityAuditEvents(entityType, entityId);
  const [filterAction, setFilterAction] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const filteredEvents = filterAction === "all"
    ? events
    : events.filter(e => e.action === filterAction);

  const uniqueActions = [...new Set(events.map(e => e.action))];

  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        Nessun evento registrato
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filter */}
      <Select value={filterAction} onValueChange={setFilterAction}>
        <SelectTrigger className="w-[200px] h-8 text-xs">
          <SelectValue placeholder="Filtra azioni" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tutte le azioni</SelectItem>
          {uniqueActions.map(a => (
            <SelectItem key={a} value={a}>{a}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Timeline */}
      <div className="relative">
        <div className="absolute left-3 top-0 bottom-0 w-px bg-border" />
        <div className="space-y-0">
          {filteredEvents.map((event) => {
            const isExpanded = expandedId === event.id;
            const hasDetails = event.changed_fields && event.changed_fields.length > 0;

            const toggle = () => hasDetails && setExpandedId(isExpanded ? null : event.id);
            return (
              <div
                key={event.id}
                role={hasDetails ? "button" : undefined}
                tabIndex={hasDetails ? 0 : undefined}
                aria-expanded={hasDetails ? isExpanded : undefined}
                className={cn(
                  "relative pl-8 py-2 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  hasDetails && "cursor-pointer hover:bg-muted/50",
                  isExpanded && "bg-muted/30"
                )}
                onClick={toggle}
                onKeyDown={hasDetails ? onActivateKey(toggle) : undefined}
              >
                {/* Dot */}
                <div className="absolute left-[9px] top-3.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />

                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col gap-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <AuditActionTag action={event.action} />
                      <AuditActorBadge
                        actorType={event.actor_type}
                        displayName={event.actor_display_name}
                      />
                    </div>
                    {event.metadata && (event.metadata as Record<string, unknown>).reason && (
                      <span className="text-xs text-muted-foreground italic">
                        {String((event.metadata as Record<string, unknown>).reason)}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                    {format(new Date(event.occurred_at), "dd MMM yyyy HH:mm", { locale: it })}
                  </span>
                </div>

                {/* Expanded diff */}
                {isExpanded && hasDetails && (
                  <div className="mt-2 p-2 bg-muted/50 rounded border">
                    <AuditDiffViewer
                      oldValue={event.old_value}
                      newValue={event.new_value}
                      changedFields={event.changed_fields}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
