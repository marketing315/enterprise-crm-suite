import { useState } from "react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Phone, Clock, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface CallSummaryMessageProps {
  message: {
    id: string;
    message_text: string;
    created_at: string;
    ai_context?: any;
  };
}

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "-";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function CallSummaryMessage({ message }: CallSummaryMessageProps) {
  const [expanded, setExpanded] = useState(false);

  // Parse metadata from ai_context if available
  const meta = message.ai_context as Record<string, any> | null;
  const duration = meta?.duration_seconds;
  const responseTime = meta?.response_time_seconds;
  const operatorName = meta?.operator_name;
  const fullTranscript = meta?.full_transcript;

  return (
    <div className="flex gap-2 bg-accent/30 -mx-2 px-2 py-1.5 rounded border border-border/50">
      <Avatar className="h-6 w-6 shrink-0">
        <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
          <Phone className="h-3 w-3" />
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
            Sistema AI
          </span>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-primary/5">
            <Sparkles className="h-2.5 w-2.5 mr-0.5" />
            Chiamata
          </Badge>
          <span className="text-[10px] text-muted-foreground">
            {format(new Date(message.created_at), "HH:mm", { locale: it })}
          </span>
        </div>

        {/* Compact summary - always visible */}
        <p className="text-xs text-foreground whitespace-pre-wrap break-words">
          {message.message_text}
        </p>

        {/* Metrics row */}
        {(duration || responseTime) && (
          <div className="flex flex-wrap gap-3 mt-1 text-[10px] text-muted-foreground">
            {duration > 0 && (
              <span className="flex items-center gap-0.5">
                <Clock className="h-3 w-3" />
                Durata: {formatDuration(duration)}
              </span>
            )}
            {responseTime > 0 && (
              <span>Tempo risposta: {formatDuration(responseTime)}</span>
            )}
          </div>
        )}

        {/* Expandable transcript */}
        {fullTranscript && (
          <button
            className="flex items-center gap-1 mt-1 text-[10px] text-primary hover:underline"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {expanded ? "Nascondi trascrizione" : "Mostra trascrizione"}
          </button>
        )}
        {expanded && fullTranscript && (
          <div className="mt-1 text-[10px] bg-background rounded p-2 max-h-[150px] overflow-y-auto whitespace-pre-wrap">
            {fullTranscript}
          </div>
        )}
      </div>
    </div>
  );
}
