import { useState, useMemo } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import { useCapiEventsSummary, useCapiEventsList } from "@/hooks/useCapiMonitor";
import { MetricCard } from "@/components/admin/MetricCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  Send,
  RefreshCw,
  Zap,
  ShoppingCart,
  Users,
  Ban,
} from "lucide-react";
import { format, subDays, subHours } from "date-fns";
import { it } from "date-fns/locale";

const PERIOD_OPTIONS = [
  { label: "Ultime 24h", value: "24h" },
  { label: "Ultimi 7 giorni", value: "7d" },
  { label: "Ultimi 30 giorni", value: "30d" },
];

const STATUS_OPTIONS = [
  { label: "Tutti", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Sent", value: "sent" },
  { label: "Failed", value: "failed" },
  { label: "Skipped", value: "skipped" },
  { label: "Processing", value: "processing" },
];

const EVENT_OPTIONS = [
  { label: "Tutti", value: "all" },
  { label: "Lead", value: "Lead" },
  { label: "Purchase", value: "Purchase" },
];

function statusBadge(status: string) {
  switch (status) {
    case "sent":
      return <Badge variant="default" className="bg-green-600 hover:bg-green-700">Sent</Badge>;
    case "pending":
      return <Badge variant="secondary">Pending</Badge>;
    case "failed":
      return <Badge variant="destructive">Failed</Badge>;
    case "skipped":
      return <Badge variant="outline">Skipped</Badge>;
    case "processing":
      return <Badge className="bg-blue-600 hover:bg-blue-700">Processing</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export default function AdminCapiMonitor() {
  const { isAdmin, isLoading: authLoading } = useAuth();
  const { currentBrand, hasBrandSelected } = useBrand();

  const [period, setPeriod] = useState("7d");
  const [statusFilter, setStatusFilter] = useState("all");
  const [eventFilter, setEventFilter] = useState("all");
  // H11 FIX: refreshKey forces recalculation of from/to on manual refresh
  const [refreshKey, setRefreshKey] = useState(0);

  const { from, to } = useMemo(() => {
    const now = new Date();
    let fromDate: Date;
    switch (period) {
      case "24h":
        fromDate = subHours(now, 24);
        break;
      case "30d":
        fromDate = subDays(now, 30);
        break;
      default:
        fromDate = subDays(now, 7);
    }
    return { from: fromDate.toISOString(), to: now.toISOString() };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, refreshKey]);

  const {
    data: summary,
    isLoading: loadingSummary,
    refetch: refetchSummary,
  } = useCapiEventsSummary(from, to);

  const {
    data: events,
    isLoading: loadingEvents,
    refetch: refetchEvents,
  } = useCapiEventsList(
    from,
    to,
    statusFilter === "all" ? null : statusFilter,
    eventFilter === "all" ? null : eventFilter
  );

  if (authLoading) return <div className="flex items-center justify-center min-h-[60vh]"><RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  if (!hasBrandSelected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <Zap className="h-12 w-12 md:h-16 md:w-16 text-muted-foreground mb-4" />
        <h2 className="text-xl md:text-2xl font-bold mb-2">Seleziona un Brand</h2>
        <p className="text-sm text-muted-foreground max-w-md">
          Utilizza il selettore nella sidebar per scegliere il brand.
        </p>
      </div>
    );
  }

  const isLoading = loadingSummary || loadingEvents;
  const handleRefresh = () => {
    refetchSummary();
    refetchEvents();
  };

  const sentRate =
    summary && summary.total_events > 0
      ? Math.round((summary.sent_count / summary.total_events) * 100)
      : 0;

  return (
    <div className="space-y-4 md:space-y-6 w-full max-w-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-lg bg-primary/10">
            <Zap className="h-4 w-4 md:h-5 md:w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg md:text-2xl font-bold">CAPI Monitor</h1>
            <p className="text-xs md:text-sm text-muted-foreground">
              Meta Conversions API · {currentBrand?.name}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      {loadingSummary ? (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[100px]" />
          ))}
        </div>
      ) : summary ? (
        <ScrollArea className="w-full">
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-5 min-w-[500px] lg:min-w-0 pb-2">
            <MetricCard
              title="Totale Eventi"
              value={summary.total_events}
              icon={Activity}
              subtitle={`${summary.lead_events} Lead · ${summary.purchase_events} Purchase`}
            />
            <MetricCard
              title="Inviati"
              value={`${sentRate}%`}
              icon={CheckCircle2}
              variant={sentRate >= 90 ? "success" : sentRate >= 70 ? "warning" : "danger"}
              subtitle={`${summary.sent_count} su ${summary.total_events}`}
            />
            <MetricCard
              title="Pending"
              value={summary.pending_count}
              icon={Clock}
              variant={summary.pending_count > 10 ? "warning" : "success"}
              subtitle={summary.processing_count > 0 ? `${summary.processing_count} in processing` : "coda vuota"}
            />
            <MetricCard
              title="Falliti"
              value={summary.failed_count}
              icon={XCircle}
              variant={summary.failed_count > 0 ? "danger" : "success"}
              subtitle={summary.skipped_count > 0 ? `${summary.skipped_count} skipped` : "nessun errore"}
            />
            <MetricCard
              title="Tentativi medi"
              value={summary.avg_attempts ?? 1}
              icon={Send}
              variant={(summary.avg_attempts ?? 1) > 2 ? "warning" : "success"}
              subtitle="per evento"
            />
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      ) : null}

      {/* Filters + Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="text-base">Eventi CAPI</CardTitle>
            <div className="flex items-center gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={eventFilter} onValueChange={setEventFilter}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loadingEvents ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : events && events.length > 0 ? (
            <ScrollArea className="w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Contatto</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Consent</TableHead>
                    <TableHead>Tentativi</TableHead>
                    <TableHead>Creato</TableHead>
                    <TableHead>Inviato</TableHead>
                    <TableHead>Errore</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((ev) => (
                    <TableRow key={ev.id}>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {ev.event_name === "Lead" ? (
                            <Users className="h-3.5 w-3.5 text-blue-500" />
                          ) : (
                            <ShoppingCart className="h-3.5 w-3.5 text-green-500" />
                          )}
                          <span className="text-sm font-medium">{ev.event_name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{ev.contact_name}</TableCell>
                      <TableCell>{statusBadge(ev.status)}</TableCell>
                      <TableCell>
                        {ev.consent_snapshot ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : (
                          <Ban className="h-4 w-4 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-center">{ev.attempts}/{ev.max_attempts}</TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(ev.created_at), "dd/MM HH:mm", { locale: it })}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {ev.sent_at
                          ? format(new Date(ev.sent_at), "dd/MM HH:mm", { locale: it })
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {ev.last_error ? (
                          <Tooltip>
                            <TooltipTrigger>
                              <span className="text-xs text-destructive truncate max-w-[150px] block">
                                {ev.last_error.slice(0, 40)}…
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-sm">
                              <p className="text-xs">{ev.last_error}</p>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Zap className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">Nessun evento CAPI nel periodo selezionato</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
