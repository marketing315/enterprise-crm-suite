import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { RefreshCw, Clock } from "lucide-react";

interface PageLoaderProps {
  /** Seconds before showing the "still loading" hint. Default 8s. */
  slowAfterMs?: number;
}

/**
 * Suspense fallback con timeout di cortesia progressivi:
 * - >2s: messaggio "Stiamo caricando…"
 * - >5s: card "Sta richiedendo più del previsto, vuoi riprovare?"
 * - >slowAfterMs (8s): avviso forte con CTA Ricarica.
 */
export function PageLoader({ slowAfterMs = 8000 }: PageLoaderProps = {}) {
  const [showHint, setShowHint] = useState(false);
  const [showRetry, setShowRetry] = useState(false);
  const [retryDismissed, setRetryDismissed] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const t1 = window.setTimeout(() => setShowHint(true), 2000);
    const t2 = window.setTimeout(() => setShowRetry(true), 5000);
    const t3 = window.setTimeout(() => setSlow(true), slowAfterMs);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [slowAfterMs]);

  return (
    <div className="flex flex-col gap-4 p-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />

      {showHint && !showRetry && (
        <p
          role="status"
          aria-live="polite"
          className="text-sm text-muted-foreground"
        >
          Stiamo caricando…
        </p>
      )}

      {showRetry && !slow && !retryDismissed && (
        <div
          role="status"
          aria-live="polite"
          className="mt-2 flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm"
        >
          <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground flex-1">
            Sta richiedendo più del previsto. Vuoi riprovare?
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRetryDismissed(true)}
            className="h-8 shrink-0"
          >
            Continua ad attendere
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.location.reload()}
            className="h-8 shrink-0"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Ricarica
          </Button>
        </div>
      )}

      {slow && (
        <div
          role="status"
          aria-live="polite"
          className="mt-2 flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm"
        >
          <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground flex-1">
            Caricamento più lento del previsto. Controlla la connessione o
            ricarica la pagina.
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.location.reload()}
            className="h-8 shrink-0"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Ricarica
          </Button>
        </div>
      )}
    </div>
  );
}
