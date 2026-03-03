import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Activity, BarChart3, AlertTriangle, CheckCircle, XCircle, Clock } from "lucide-react";
import { useMcpExecutions, type McpExecutionStatus } from "@/hooks/useMcpData";
import { McpLatencyChart } from "./McpLatencyChart";

const STATUS_CONFIG: Record<McpExecutionStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending_approval: { label: "Pending", variant: "secondary" },
  approved: { label: "Approved", variant: "default" },
  rejected: { label: "Rejected", variant: "destructive" },
  running: { label: "Running", variant: "outline" },
  success: { label: "Success", variant: "default" },
  failed: { label: "Failed", variant: "destructive" },
  failed_transient: { label: "Retry", variant: "secondary" },
  cancelled: { label: "Cancelled", variant: "outline" },
  timeout: { label: "Timeout", variant: "destructive" },
};

export function McpObservabilityTab() {
  const { data: executions = [], isLoading } = useMcpExecutions(100);

  const stats = useMemo(() => {
    const total = executions.length;
    const success = executions.filter((e) => e.status === "success").length;
    const failed = executions.filter((e) => ["failed", "failed_transient", "timeout"].includes(e.status)).length;
    const pending = executions.filter((e) => e.status === "pending_approval").length;
    const avgLatency = executions.filter((e) => e.latency_ms).reduce((sum, e) => sum + (e.latency_ms || 0), 0) / (executions.filter((e) => e.latency_ms).length || 1);
    return { total, success, failed, pending, avgLatency: Math.round(avgLatency) };
  }, [executions]);

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-5">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <BarChart3 className="h-4 w-4" /> Totale
            </div>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <CheckCircle className="h-4 w-4 text-green-500" /> Successi
            </div>
            <div className="text-2xl font-bold text-green-600">{stats.success}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <XCircle className="h-4 w-4 text-destructive" /> Falliti
            </div>
            <div className="text-2xl font-bold text-destructive">{stats.failed}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Clock className="h-4 w-4" /> In attesa
            </div>
            <div className="text-2xl font-bold">{stats.pending}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Activity className="h-4 w-4" /> Latenza avg
            </div>
            <div className="text-2xl font-bold">{stats.avgLatency}ms</div>
          </CardContent>
        </Card>
      </div>
      {/* Latency Chart */}
      <McpLatencyChart />

      {/* Execution Log */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" /> Execution Trace
          </CardTitle>
          <CardDescription>Ultime 100 esecuzioni con dettaglio policy, latenza e outcome.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : executions.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">Nessuna esecuzione registrata</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Tool / Resource</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Decision</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Latenza</TableHead>
                    <TableHead>Errore</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {executions.map((e) => {
                    const sc = STATUS_CONFIG[e.status];
                    return (
                      <TableRow key={e.id}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(e.created_at), "dd/MM HH:mm:ss", { locale: it })}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{e.tool_name || e.resource_uri || "—"}</TableCell>
                        <TableCell className="text-xs">{e.actor_type}</TableCell>
                        <TableCell>
                          {e.decision && (
                            <Badge variant={e.decision === "deny" ? "destructive" : e.decision === "require_approval" ? "secondary" : "default"} className="text-xs">
                              {e.decision}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={sc.variant} className="text-xs">{sc.label}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {e.latency_ms ? `${e.latency_ms}ms` : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-destructive max-w-[200px] truncate">
                          {e.error_message || "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
