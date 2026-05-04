import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Riconosce i fallimenti di `import()` dinamico (chunk lazy non
 * scaricabili) tipici dopo un deploy che ha invalidato gli hash dei
 * bundle, oppure quando la rete è caduta a metà del download.
 *
 * In quei casi un retry React non basta: serve un hard reload per
 * rifare il fetch dell'index e dei nuovi chunk. Per ogni altro errore
 * rilancia, lasciando lavorare l'ErrorBoundary applicativo a monte.
 */
function isChunkLoadError(error: Error): boolean {
  const msg = `${error?.name ?? ""} ${error?.message ?? ""}`.toLowerCase();
  return (
    msg.includes("chunkloaderror") ||
    msg.includes("loading chunk") ||
    msg.includes("loading css chunk") ||
    msg.includes("failed to fetch dynamically imported module") ||
    msg.includes("importing a module script failed")
  );
}

export class ChunkLoadErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    if (isChunkLoadError(error)) return { error };
    // Non gestiamo errori applicativi: li rilanciamo all'ErrorBoundary padre.
    throw error;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (isChunkLoadError(error)) {
      console.warn("[ChunkLoadErrorBoundary] dynamic import failed", error, info.componentStack);
    }
  }

  private hardReload = () => {
    // Cache-busting: alcuni browser tengono in cache l'index HTML.
    const url = new URL(window.location.href);
    url.searchParams.set("_r", Date.now().toString(36));
    window.location.replace(url.toString());
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex flex-col items-center justify-center gap-4 p-12 text-center">
        <div className="rounded-full bg-destructive/10 p-4">
          <AlertTriangle className="h-8 w-8 text-destructive" />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-semibold">Aggiornamento richiesto</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            Una nuova versione dell'app è stata pubblicata o la connessione si
            è interrotta durante il caricamento. Ricarica per continuare.
          </p>
        </div>
        <Button variant="default" onClick={this.hardReload}>
          <RefreshCw className="h-4 w-4 mr-2" /> Ricarica ora
        </Button>
      </div>
    );
  }
}
