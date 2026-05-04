import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { RefreshCw, Clock } from "lucide-react";

interface PageLoaderProps {
  /** Seconds before showing the "still loading" hint. Default 8s. */
  slowAfterMs?: number;
}

/**
 * Suspense fallback con timeout di cortesia.
 *
 * - 0..slowAfterMs: skeleton minimale.
 * - >slowAfterMs: avviso non bloccante con CTA di ricarica (utile quando
 *   il chunk lazy è bloccato per rete lenta o sessione sospesa).
 *
 * Gli errori applicativi/RLS NON arrivano qui (react-query li gestisce
 * nei singoli hook); per i fallimenti di import dinamico c'è
 * ChunkLoadErrorBoundary che intercetta e propone hard reload.
 */
export function PageLoader({ slowAfterMs = 8000 }: PageLoaderProps = {}) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setSlow(true), slowAfterMs);
    return () => window.clearTimeout(t);
  }, [slowAfterMs]);

  return (
    <div className="flex flex-col gap-4 p-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />

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
