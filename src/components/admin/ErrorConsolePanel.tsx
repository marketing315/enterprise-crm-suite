import { useState, useEffect, useCallback } from "react";
import { Bug, Trash2, X, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { onActivateKey } from "@/lib/a11y";

interface LogEntry {
  id: number;
  level: "error" | "warn" | "info" | "log";
  message: string;
  timestamp: Date;
  stack?: string;
}

let logCounter = 0;

function isEmptyPlainObject(value: unknown): value is Record<string, never> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value as Record<string, unknown>).length === 0
  );
}

function formatLogArg(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error || value instanceof DOMException) {
    return `${value.name}: ${value.message}`;
  }

  if (isEmptyPlainObject(value)) return "{}";

  if (typeof value === "object" && value !== null) {
    const errorLike = value as Record<string, unknown>;
    const summary = {
      name: errorLike.name,
      message: errorLike.message,
      code: errorLike.code,
      details: errorLike.details,
      hint: errorLike.hint,
      status: errorLike.status,
    };

    const hasSummary = Object.values(summary).some(Boolean);
    try {
      return JSON.stringify(hasSummary ? summary : value, null, 2);
    } catch {
      return String(value);
    }
  }

  return String(value);
}

const levelColors: Record<string, string> = {
  error: "bg-destructive text-destructive-foreground",
  warn: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/30",
  info: "bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/30",
  log: "bg-muted text-muted-foreground",
};

export const ERROR_CONSOLE_OPEN_EVENT = "ralph:open-error-console";

export function openErrorConsole() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(ERROR_CONSOLE_OPEN_EVENT));
  }
}

export function ErrorConsolePanel() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "error" | "warn">("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener(ERROR_CONSOLE_OPEN_EVENT, handler);
    return () => window.removeEventListener(ERROR_CONSOLE_OPEN_EVENT, handler);
  }, []);

  const addLog = useCallback((level: LogEntry["level"], args: unknown[], stack?: string) => {
    const message = args.map(formatLogArg).join(" ");

    // Defer state update to avoid "Cannot update a component while rendering a different component"
    queueMicrotask(() => {
      setLogs(prev => {
        const entry: LogEntry = { id: ++logCounter, level, message, timestamp: new Date(), stack };
        const next = [entry, ...prev];
        return next.slice(0, 200);
      });
    });
  }, []);

  useEffect(() => {
    const origError = console.error;
    const origWarn = console.warn;

    console.error = (...args: unknown[]) => {
      // Filter out harmless recharts ref warnings
      const msg = String(args[0] ?? "");
      const isSingleEmptyObject = args.length === 1 && isEmptyPlainObject(args[0]);
      if (
        msg.includes("Function components cannot be given refs") ||
        (msg.includes("DialogContent") && msg.includes("DialogTitle")) ||
        (msg.includes("Missing") && msg.includes("aria-describedby")) ||
        msg.includes("contextMenuMessage") ||
        isSingleEmptyObject
      ) {
        origError.apply(console, args);
        return;
      }
      addLog("error", args, new Error().stack);
      origError.apply(console, args);
    };
    console.warn = (...args: unknown[]) => {
      addLog("warn", args);
      origWarn.apply(console, args);
    };

    const handler = (e: ErrorEvent) => {
      addLog("error", [e.message], e.error?.stack);
    };
    const rejHandler = (e: PromiseRejectionEvent) => {
      const reason = e.reason;
      const isAbortError = reason instanceof DOMException && reason.name === "AbortError";
      const isEmptyObjectReason = isEmptyPlainObject(reason);

      if (isAbortError || isEmptyObjectReason) {
        e.preventDefault();
        return;
      }

      addLog("error", ["Unhandled rejection:", reason], reason?.stack);
    };

    window.addEventListener("error", handler);
    window.addEventListener("unhandledrejection", rejHandler);

    return () => {
      console.error = origError;
      console.warn = origWarn;
      window.removeEventListener("error", handler);
      window.removeEventListener("unhandledrejection", rejHandler);
    };
  }, [addLog]);

  const errorCount = logs.filter(l => l.level === "error").length;
  const filtered = filter === "all" ? logs : logs.filter(l => l.level === filter);

  if (!open) {
    return (
      <Button
        variant="outline"
        size="icon"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-[9999] h-12 w-12 rounded-full shadow-lg border-2 border-destructive/50 bg-background hover:bg-destructive/10"
        title="Console Errori"
       aria-label="Segnalazione bug">
        <Bug className="h-5 w-5" />
        {errorCount > 0 && (
          <Badge className="absolute -top-2 -right-2 h-5 min-w-5 px-1 text-xs bg-destructive text-destructive-foreground">
            {errorCount}
          </Badge>
        )}
      </Button>
    );
  }

  return (
    <div className="fixed bottom-0 right-0 z-[9999] w-full sm:w-[520px] h-[400px] border-t sm:border-l border-border bg-background shadow-2xl flex flex-col rounded-tl-lg">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/50">
        <div className="flex items-center gap-2">
          <Bug className="h-4 w-4 text-destructive" />
          <span className="font-semibold text-sm">Console</span>
          {errorCount > 0 && (
            <Badge variant="destructive" className="text-xs">{errorCount} errori</Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          {(["all", "error", "warn"] as const).map(f => (
            <Button
              key={f}
              variant={filter === f ? "default" : "ghost"}
              size="sm"
              className="h-6 text-xs px-2"
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "Tutti" : f === "error" ? "Errori" : "Warning"}
            </Button>
          ))}
          <Button variant="ghost" size="icon" className="h-6 w-6 ml-1" onClick={() => setLogs([])} aria-label="Elimina">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setOpen(false)} aria-label="Chiudi">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Logs */}
      <ScrollArea className="flex-1">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm p-8">
            Nessun log {filter !== "all" ? `di tipo "${filter}"` : ""} registrato
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map(log => (
              <div
                key={log.id}
                role="button"
                tabIndex={0}
                aria-expanded={expandedId === log.id}
                className={cn(
                  "px-3 py-2 text-xs font-mono cursor-pointer hover:bg-muted/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  log.level === "error" && "bg-destructive/5"
                )}
                onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                onKeyDown={onActivateKey(() => setExpandedId(expandedId === log.id ? null : log.id))}
              >
                <div className="flex items-start gap-2">
                  <Badge className={cn("text-[10px] px-1.5 py-0 shrink-0 mt-0.5", levelColors[log.level])}>
                    {log.level}
                  </Badge>
                  <span className="text-muted-foreground shrink-0">
                    {log.timestamp.toLocaleTimeString("it-IT")}
                  </span>
                  <span className="break-all line-clamp-2">{log.message}</span>
                  {log.stack && (
                    expandedId === log.id
                      ? <ChevronUp className="h-3 w-3 shrink-0 mt-0.5" />
                      : <ChevronDown className="h-3 w-3 shrink-0 mt-0.5" />
                  )}
                </div>
                {expandedId === log.id && log.stack && (
                  <pre className="mt-2 p-2 bg-muted rounded text-[10px] overflow-x-auto whitespace-pre-wrap text-muted-foreground">
                    {log.stack}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
