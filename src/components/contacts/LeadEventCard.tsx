import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { FileJson, Brain } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface LeadEvent {
  id: string;
  source: string;
  received_at: string;
  source_name?: string | null;
  raw_payload?: any;
  ai_priority?: number | null;
  lead_type?: string | null;
  ai_confidence?: number | null;
  ai_rationale?: string | null;
  ai_conversation_summary?: string | null;
}

interface LeadEventCardProps {
  event: LeadEvent;
}

export function LeadEventCard({ event }: LeadEventCardProps) {
  const ev = event as any;

  return (
    <div className="rounded-lg border p-3 space-y-2 overflow-hidden">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline">{event.source}</Badge>
          {ev.lead_type && (
            <Badge variant="secondary" className="text-xs">{ev.lead_type}</Badge>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {format(new Date(event.received_at), 'dd/MM/yyyy HH:mm', { locale: it })}
        </span>
      </div>

      {event.source_name && (
        <p className="text-sm break-words">
          <span className="text-muted-foreground">Sorgente:</span> {event.source_name}
        </p>
      )}

      {event.raw_payload && typeof event.raw_payload === 'object' && (event.raw_payload as any).source_url && (
        <p className="text-sm truncate">
          <span className="text-muted-foreground">URL:</span>{' '}
          <a
            href={(event.raw_payload as any).source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            {(event.raw_payload as any).source_url}
          </a>
        </p>
      )}

      {/* AI Data */}
      {(ev.ai_priority != null || ev.ai_confidence != null) && (
        <div className="flex items-center gap-3 text-sm flex-wrap">
          {ev.ai_priority != null && (
            <span>
              <span className="text-muted-foreground">Priorità AI:</span> {ev.ai_priority}
            </span>
          )}
          {ev.ai_confidence != null && (
            <span>
              <span className="text-muted-foreground">Confidenza:</span>{' '}
              {Math.round(ev.ai_confidence * 100)}%
            </span>
          )}
        </div>
      )}

      {ev.ai_conversation_summary && (
        <div className="text-sm">
          <span className="text-muted-foreground">Riepilogo AI:</span>{' '}
          <span className="whitespace-pre-wrap break-words">{ev.ai_conversation_summary}</span>
        </div>
      )}

      {ev.ai_rationale && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground flex items-center gap-1">
            <Brain className="h-3 w-3" />
            Motivazione AI
          </summary>
          <p className="mt-1 p-2 bg-muted rounded text-xs whitespace-pre-wrap break-words">
            {ev.ai_rationale}
          </p>
        </details>
      )}

      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground flex items-center gap-1">
          <FileJson className="h-3 w-3" />
          Payload raw
        </summary>
        <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-x-auto whitespace-pre-wrap break-words">
          {JSON.stringify(event.raw_payload, null, 2)}
        </pre>
      </details>
    </div>
  );
}
