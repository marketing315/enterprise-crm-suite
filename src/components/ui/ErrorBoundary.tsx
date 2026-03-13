import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

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
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      `[ErrorBoundary${this.props.label ? `:${this.props.label}` : ""}]`,
      error,
      info.componentStack
    );
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
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
      <div className="flex flex-col items-center justify-center gap-4 p-12 text-center">
        <div className="rounded-full bg-destructive/10 p-4">
          <AlertTriangle className="h-8 w-8 text-destructive" />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-semibold">
            {this.props.label ? `Errore: ${this.props.label}` : "Si è verificato un errore"}
          </h3>
          <p className="text-sm text-muted-foreground max-w-md">
            {error.message || "Errore imprevisto. Riprova o ricarica la pagina."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={this.reset}>
            <RefreshCw className="h-4 w-4 mr-2" /> Riprova
          </Button>
          <Button variant="default" onClick={() => window.location.reload()}>
            Ricarica pagina
          </Button>
        </div>
      </div>
    );
  }
}
