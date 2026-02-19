import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { RotateCcw, History, RefreshCw } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLeadDigestRuns, useManualRetryRun, type LeadDigestRun } from "@/hooks/useLeadDigest";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";

function statusBadge(status: LeadDigestRun["status"]) {
  const map = {
    sent: { label: "Inviato", variant: "default" as const },
    failed: { label: "Fallito", variant: "destructive" as const },
    pending: { label: "In corso", variant: "secondary" as const },
  };
  const { label, variant } = map[status] ?? { label: status, variant: "outline" as const };
  return <Badge variant={variant}>{label}</Badge>;
}

function triggerBadge(type: LeadDigestRun["trigger_type"]) {
  const map = {
    scheduled: { label: "Schedulato", variant: "outline" as const },
    manual: { label: "Manuale", variant: "secondary" as const },
    retry: { label: "Retry", variant: "outline" as const },
  };
  const { label, variant } = map[type] ?? { label: type, variant: "outline" as const };
  return <Badge variant={variant} className="text-xs">{label}</Badge>;
}

function fmt(iso: string | null) {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "dd/MM HH:mm", { locale: it });
  } catch {
    return iso;
  }
}

export function LeadDigestRunsTable() {
  const { data: runs, isLoading, refetch } = useLeadDigestRuns(100);
  const retryMutation = useManualRetryRun();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleRetry = async (id: string) => {
    try {
      await retryMutation.mutateAsync(id);
      toast.success("Retry programmato — il dispatcher lo processirà entro 5 minuti");
    } catch (e: any) {
      toast.error(e.message || "Errore retry");
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Storico invii digest
            </CardTitle>
            <CardDescription>
              Ultimi 100 run — aggiornamento automatico ogni 30s
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Aggiorna
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {!runs?.length ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <History className="h-10 w-10 mb-3 opacity-40" />
            <p>Nessun invio ancora</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Finestra</TableHead>
                  <TableHead className="text-right">Raw</TableHead>
                  <TableHead className="text-right">Unici</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tentativo</TableHead>
                  <TableHead>Errore</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => (
                  <React.Fragment key={run.id}>
                    <TableRow
                      className="cursor-pointer"
                      onClick={() => setExpandedId(expandedId === run.id ? null : run.id)}
                    >
                      <TableCell className="text-xs font-mono whitespace-nowrap">
                        {fmt(run.created_at)}
                      </TableCell>
                      <TableCell>{triggerBadge(run.trigger_type)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {fmt(run.window_start)} → {fmt(run.window_end)}
                      </TableCell>
                      <TableCell className="text-right font-mono">{run.lead_count_raw}</TableCell>
                      <TableCell className="text-right font-mono font-semibold">{run.lead_count_unique}</TableCell>
                      <TableCell>{statusBadge(run.status)}</TableCell>
                      <TableCell className="text-center">{run.attempt_no}</TableCell>
                      <TableCell className="text-xs text-destructive max-w-48 truncate">
                        {run.error_message || "—"}
                      </TableCell>
                      <TableCell>
                        {run.status === "failed" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRetry(run.id);
                            }}
                            disabled={retryMutation.isPending}
                          >
                            <RotateCcw className="h-3.5 w-3.5 mr-1" />
                            Retry
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                    {expandedId === run.id && (
                      <TableRow key={`${run.id}-expanded`}>
                        <TableCell colSpan={9} className="bg-muted/30 text-xs">
                          <div className="p-2 space-y-1">
                            {run.dedupe_stats && (
                              <div>
                                <span className="font-medium">Deduplica: </span>
                                {Object.entries(run.dedupe_stats).map(([k, v]) => (
                                  <span key={k} className="mr-3">{k}: {v}</span>
                                ))}
                              </div>
                            )}
                            <div>
                              <span className="font-medium">TO: </span>
                              {run.to_recipients?.join(", ") || "—"}
                              {run.cc_recipients?.length ? (
                                <span> | <span className="font-medium">CC: </span>{run.cc_recipients.join(", ")}</span>
                              ) : null}
                            </div>
                            {run.response_status && (
                              <div>
                                <span className="font-medium">HTTP: </span>{run.response_status}
                              </div>
                            )}
                            {run.scheduled_for_retry_at && (
                              <div>
                                <span className="font-medium">Retry programmato: </span>
                                {fmt(run.scheduled_for_retry_at)}
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
