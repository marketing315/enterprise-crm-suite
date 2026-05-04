import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Props {
  children: ReactNode;
  /** Optional label shown in the fallback UI */
  label?: string;
  /** Render a compact inline fallback instead of full-page */
  compact?: boolean;
  /** Optional custom fallback renderer */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
  errorId: string | null;
}

function generateErrorId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID().slice(0, 8).toUpperCase();
    }
  } catch {
    /* noop */
  }
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, errorId: null };

  static getDerivedStateFromError(error: Error): State {
    return { error, errorId: generateErrorId() };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      `[ErrorBoundary${this.props.label ? `:${this.props.label}` : ""}] id=${this.state.errorId}`,
      error,
      info.componentStack
    );
  }

  reset = () => {
    this.setState({ error: null, errorId: null });
  };

  copyId = () => {
    if (!this.state.errorId) return;
    try {
      navigator.clipboard.writeText(this.state.errorId);
      toast.success("ID errore copiato");
    } catch {
      toast.error("Impossibile copiare");
    }
  };

  render() {
    const { error, errorId } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) {
      return this.props.fallback(error, this.reset);
    }

    if (this.props.compact) {
      return (
        <div className="flex items-center gap-3 p-4 rounded-lg border border-destructive/30 bg-destructive/5 text-sm">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
          <span className="text-muted-foreground flex-1 truncate">
            {this.props.label ? `Errore in ${this.props.label}` : "Si è verificato un errore"}
          </span>
          <Button variant="ghost" size="sm" className="h-7 shrink-0" onClick={this.reset}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Riprova
          </Button>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center gap-4 p-12 text-center min-h-[60vh]">
        <div className="rounded-full bg-destructive/10 p-4">
          <AlertTriangle className="h-8 w-8 text-destructive" />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-semibold">
            Qualcosa è andato storto
          </h3>
          <p className="text-sm text-muted-foreground max-w-md">
            Niente panico, i tuoi dati sono salvi. Puoi riprovare o tornare alla dashboard.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 justify-center">
          <Button variant="outline" onClick={this.reset}>
            <RefreshCw className="h-4 w-4 mr-2" /> Riprova
          </Button>
          <Button variant="outline" onClick={() => window.location.assign("/dashboard")}>
            <Home className="h-4 w-4 mr-2" /> Torna alla dashboard
          </Button>
          <Button variant="default" onClick={() => window.location.reload()}>
            Ricarica pagina
          </Button>
        </div>
        {errorId && (
          <button
            type="button"
            onClick={this.copyId}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            ID errore: <span className="font-mono">{errorId}</span>
            <Copy className="h-3 w-3" />
          </button>
        )}
        <details className="text-xs text-muted-foreground max-w-md">
          <summary className="cursor-pointer hover:text-foreground">
            Dettagli tecnici
          </summary>
          <pre className="mt-2 p-2 rounded bg-muted/40 text-left overflow-auto max-h-32 whitespace-pre-wrap break-words">
            {error.message || "Errore imprevisto"}
          </pre>
        </details>
      </div>
    );
  }
}
