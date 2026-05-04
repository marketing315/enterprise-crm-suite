import { useMemo } from "react";
import { AlertTriangle, RefreshCw, LifeBuoy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface QueryErrorStateProps {
  error: unknown;
  /** Es. "i tuoi contatti", "i ticket". Default: "i dati". */
  entityLabel?: string;
  onRetry?: () => void;
  className?: string;
  compact?: boolean;
}

function getErrorMessage(error: unknown): string {
  if (!error) return "Errore sconosciuto";
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Errore sconosciuto";
  }
}

/**
 * Error state umano per query fallite.
 * Mostra messaggio leggibile + Riprova + link supporto + ID errore.
 */
export function QueryErrorState({
  error,
  entityLabel = "i dati",
  onRetry,
  className,
  compact = false,
}: QueryErrorStateProps) {
  const errorId = useMemo(
    () =>
      (typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID().slice(0, 8)
        : Math.random().toString(36).slice(2, 10)
      ).toUpperCase(),
    []
  );

  const message = getErrorMessage(error);

  const supportHref = `mailto:supporto@gruppobenessere.it?subject=${encodeURIComponent(
    "Errore CRM"
  )}&body=${encodeURIComponent(`ID errore: ${errorId}\n\nDettaglio: ${message}`)}`;

  if (compact) {
    return (
      <div
        role="alert"
        className={cn(
          "flex items-center gap-3 p-4 rounded-lg border border-destructive/30 bg-destructive/5 text-sm",
          className
        )}
      >
        <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
        <span className="text-muted-foreground flex-1">
          Non siamo riusciti a caricare {entityLabel}.
        </span>
        {onRetry && (
          <Button variant="outline" size="sm" className="h-8" onClick={onRetry}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Riprova
          </Button>
        )}
      </div>
    );
  }

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-4 py-12 px-6 text-center",
        className
      )}
    >
      <div className="rounded-full bg-destructive/10 p-4">
        <AlertTriangle className="h-8 w-8 text-destructive" />
      </div>
      <div className="space-y-1 max-w-md">
        <h3 className="text-base font-semibold text-foreground">
          Non siamo riusciti a caricare {entityLabel}.
        </h3>
        <p className="text-sm text-muted-foreground">
          Riprova fra un attimo. Se il problema continua, contatta l'amministratore.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          onClick={() => (onRetry ? onRetry() : window.location.reload())}
          size="sm"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Ricarica
        </Button>
        <Button asChild variant="ghost" size="sm">
          <a href={supportHref}>
            <LifeBuoy className="h-4 w-4 mr-2" />
            Segnala il problema
          </a>
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        ID errore: <span className="font-mono">{errorId}</span>
      </p>
      <details className="text-xs text-muted-foreground max-w-md">
        <summary className="cursor-pointer hover:text-foreground">
          Dettagli tecnici
        </summary>
        <pre className="mt-2 p-2 rounded bg-muted/40 text-left overflow-auto max-h-32 whitespace-pre-wrap break-words">
          {message}
        </pre>
      </details>
    </div>
  );
}
