import { useState } from "react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Phone, PhoneIncoming, PhoneOff, Clock, ChevronDown, ChevronUp, FileText, Loader2, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useContactCallTranscripts } from "@/hooks/useCallTranscripts";
import { CallActionReviewPanel } from "@/components/calls/CallActionReviewPanel";

interface CallTranscriptsSectionProps {
  contactId: string;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  completed: { label: "Completata", className: "bg-primary/10 text-primary" },
  answered: { label: "Risposta", className: "bg-primary/10 text-primary" },
  no_answer: { label: "Senza risposta", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  missed: { label: "Persa", className: "bg-destructive/10 text-destructive" },
  failed: { label: "Fallita", className: "bg-destructive/10 text-destructive" },
  busy: { label: "Occupato", className: "bg-muted text-muted-foreground" },
  initiated: { label: "Iniziata", className: "bg-muted text-muted-foreground" },
  ringing: { label: "Squillo", className: "bg-amber-500/10 text-amber-600" },
};

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "-";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function CallTranscriptsSection({ contactId }: CallTranscriptsSectionProps) {
  const { data: transcripts = [], isLoading } = useContactCallTranscripts(contactId);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
          <FileText className="h-4 w-4" />
          Trascrizioni Chiamate
        </h3>
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (transcripts.length === 0) return null;

  return (
    <>
      <Separator />
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
          <FileText className="h-4 w-4" />
          Trascrizioni Chiamate ({transcripts.length})
        </h3>
        <div className="space-y-2">
          {transcripts.map((t) => {
            const call = t.call_log;
            const isExpanded = expandedId === t.id;
            const statusKey = call?.outcome || call?.status || "initiated";
            const statusConf = STATUS_CONFIG[statusKey] || STATUS_CONFIG.initiated;
            const isInbound = call?.call_type === "inbound";

            return (
              <div
                key={t.id}
                className="border rounded-lg overflow-hidden"
              >
                {/* Header - always visible */}
                <button
                  className="w-full text-left p-3 flex items-center gap-2 hover:bg-muted/50 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : t.id)}
                >
                  {isInbound ? (
                    <PhoneIncoming className="h-4 w-4 text-primary shrink-0" />
                  ) : (
                    <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium">
                        {call?.user?.full_name || "Operatore"}
                      </span>
                      <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", statusConf.className)}>
                        {statusConf.label}
                      </Badge>
                      {call?.duration_seconds > 0 && (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                          <Clock className="h-3 w-3" />
                          {formatDuration(call.duration_seconds)}
                        </span>
                      )}
                      {t.ai_status === "pending" && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-500/10 text-amber-600">
                          <Loader2 className="h-3 w-3 mr-0.5 animate-spin" />
                          In elaborazione
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-muted-foreground">
                        {call?.started_at
                          ? format(new Date(call.started_at), "dd MMM yyyy HH:mm", { locale: it })
                          : format(new Date(t.created_at), "dd MMM yyyy HH:mm", { locale: it })}
                      </span>
                      {t.summary && (
                        <span className="text-xs text-foreground truncate max-w-[200px]">
                          {t.summary}
                        </span>
                      )}
                    </div>
                  </div>

                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="px-3 pb-3 space-y-2 border-t bg-muted/20">
                    {/* Call metrics */}
                    <div className="flex flex-wrap gap-3 pt-2 text-xs text-muted-foreground">
                      {call?.response_time_seconds != null && call.response_time_seconds > 0 && (
                        <span>Tempo risposta: <strong className="text-foreground">{formatDuration(call.response_time_seconds)}</strong></span>
                      )}
                      {call?.duration_seconds != null && call.duration_seconds > 0 && (
                        <span>Durata: <strong className="text-foreground">{formatDuration(call.duration_seconds)}</strong></span>
                      )}
                      <span>Telefono: {call?.phone_number || "-"}</span>
                    </div>

                    {/* Summary */}
                    {t.summary && (
                      <div className="space-y-1">
                        <span className="text-xs font-medium text-muted-foreground">Riassunto AI</span>
                        <p className="text-sm bg-background rounded-md p-2 whitespace-pre-wrap">
                          {t.summary}
                        </p>
                      </div>
                    )}

                    {/* Full transcript */}
                    {t.full_text && (
                      <div className="space-y-1">
                        <span className="text-xs font-medium text-muted-foreground">Trascrizione completa</span>
                        <p className="text-xs bg-background rounded-md p-2 whitespace-pre-wrap max-h-[200px] overflow-y-auto">
                          {t.full_text}
                        </p>
                      </div>
                    )}

                    {/* AI error */}
                    {t.ai_status === "failed" && t.ai_error && (
                      <p className="text-xs text-destructive">
                        Errore AI: {t.ai_error}
                      </p>
                    )}

                    {/* AI Call Action Proposals */}
                    {call?.id && t.ai_status === "completed" && (
                      <CallActionReviewPanel callLogId={call.id} />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
