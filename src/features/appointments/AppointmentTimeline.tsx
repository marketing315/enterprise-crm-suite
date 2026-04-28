import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import {
  Plus,
  UserPlus,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Calendar as CalendarIcon,
  PenSquare,
  Clock,
  History,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useAppointmentAuditTimeline, type AppointmentTimelineEvent } from "./useAppointmentAuditTimeline";
import { OUTCOME_LABELS } from "./taxonomy";

interface AppointmentTimelineProps {
  appointmentId: string;
}

interface EventVisual {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  tone: "default" | "success" | "warning" | "danger" | "info";
}

function getEventVisual(ev: AppointmentTimelineEvent): EventVisual {
  // Outcome events
  if (ev.kind === "outcome") {
    const code = (ev.new_value?.outcome_code as string) || "";
    const label = OUTCOME_LABELS[code as keyof typeof OUTCOME_LABELS] ?? `Esito: ${code}`;
    if (code === "executed") return { icon: CheckCircle2, label, tone: "success" };
    if (code.startsWith("no_show")) return { icon: AlertTriangle, label, tone: "danger" };
    if (code.startsWith("cancelled")) return { icon: XCircle, label, tone: "danger" };
    if (code === "rescheduled") return { icon: RefreshCw, label, tone: "warning" };
    return { icon: PenSquare, label, tone: "info" };
  }

  // Audit events
  switch (ev.action) {
    case "create":
      return { icon: Plus, label: "Appuntamento creato", tone: "success" };
    case "assign":
      return { icon: UserPlus, label: "Venditore assegnato", tone: "info" };
    case "status_change": {
      const newStatus = ev.new_value?.status as string;
      return {
        icon: CheckCircle2,
        label: `Stato → ${newStatus ?? "modificato"}`,
        tone: "info",
      };
    }
    case "update": {
      // Detect time change vs other updates
      const oldDt = ev.old_value?.scheduled_at as string | undefined;
      const newDt = ev.new_value?.scheduled_at as string | undefined;
      if (oldDt && newDt && oldDt !== newDt) {
        return { icon: CalendarIcon, label: "Appuntamento spostato", tone: "warning" };
      }
      return { icon: PenSquare, label: "Appuntamento aggiornato", tone: "default" };
    }
    default:
      return { icon: Clock, label: ev.action, tone: "default" };
  }
}

const TONE_CLASSES: Record<EventVisual["tone"], string> = {
  default: "bg-muted text-muted-foreground border-border",
  success: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  warning: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  danger: "bg-destructive/10 text-destructive border-destructive/30",
  info: "bg-blue-500/10 text-blue-600 border-blue-500/30",
};

function formatDelta(ev: AppointmentTimelineEvent): string | null {
  if (ev.kind === "outcome") {
    const notes = ev.new_value?.outcome_notes as string | undefined;
    const next = ev.new_value?.next_action as string | undefined;
    return [notes, next && `Next: ${next}`].filter(Boolean).join(" · ") || null;
  }

  if (ev.action === "update") {
    const oldDt = ev.old_value?.scheduled_at as string | undefined;
    const newDt = ev.new_value?.scheduled_at as string | undefined;
    if (oldDt && newDt && oldDt !== newDt) {
      try {
        return `${format(parseISO(oldDt), "d MMM HH:mm", { locale: it })} → ${format(
          parseISO(newDt),
          "d MMM HH:mm",
          { locale: it }
        )}`;
      } catch {
        return null;
      }
    }
  }

  if (ev.action === "assign") {
    const oldId = ev.old_value?.assigned_sales_user_id as string | undefined;
    return oldId ? "Riassegnato" : "Prima assegnazione";
  }

  return null;
}

export function AppointmentTimeline({ appointmentId }: AppointmentTimelineProps) {
  const { data: events, isLoading } = useAppointmentAuditTimeline(appointmentId);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          Cronologia
        </CardTitle>
        {events && events.length > 0 && (
          <Badge variant="outline" className="text-xs">
            {events.length} evento{events.length === 1 ? "" : "i"}
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : !events || events.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nessun evento registrato.
          </p>
        ) : (
          <ol className="relative space-y-4 ml-3">
            <span
              aria-hidden
              className="absolute left-3 top-2 bottom-2 w-px bg-border/60"
            />
            {events.map((ev, idx) => {
              const visual = getEventVisual(ev);
              const Icon = visual.icon;
              const delta = formatDelta(ev);
              return (
                <li
                  key={ev.id}
                  className="relative flex gap-3 animate-fade-in"
                  style={{ animationDelay: `${idx * 30}ms`, animationFillMode: "both" }}
                >
                  <div
                    className={`relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${TONE_CLASSES[visual.tone]}`}
                  >
                    <Icon className="h-3 w-3" />
                  </div>
                  <div className="flex-1 min-w-0 -mt-0.5">
                    <div className="flex items-baseline justify-between gap-2 flex-wrap">
                      <span className="text-sm font-medium">{visual.label}</span>
                      <span className="text-[11px] text-muted-foreground tabular-nums">
                        {format(parseISO(ev.occurred_at), "d MMM yyyy, HH:mm", { locale: it })}
                      </span>
                    </div>
                    {delta && (
                      <p className="text-xs text-muted-foreground mt-0.5">{delta}</p>
                    )}
                    {ev.actor_name && (
                      <p className="text-[11px] text-muted-foreground/80 mt-0.5">
                        da {ev.actor_name}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
