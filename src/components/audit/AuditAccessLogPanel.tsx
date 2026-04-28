import { useMemo, useState } from "react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Eye, Loader2, ChevronLeft, ChevronRight, Shield } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { DateRangeFilter } from "@/components/contacts/DateRangeFilter";
import { useAuditAccessLog, type AuditAccessLogFilters } from "@/hooks/useAuditAccessLog";

const ACCESS_TYPE_LABELS: Record<string, { label: string; tone: string }> = {
  console_view: { label: "Console", tone: "secondary" },
  export: { label: "Export", tone: "destructive" },
  entity_timeline: { label: "Timeline entità", tone: "outline" },
  unified_timeline: { label: "Timeline globale", tone: "outline" },
  dashboard: { label: "Dashboard", tone: "secondary" },
  anomaly_check: { label: "Anomalie", tone: "outline" },
};

const PAGE_SIZE = 50;

export function AuditAccessLogPanel() {
  const [page, setPage] = useState(0);
  const [accessType, setAccessType] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();

  const filters: AuditAccessLogFilters = useMemo(() => ({
    accessType: accessType === "all" ? undefined : accessType,
    dateFrom,
    dateTo,
  }), [accessType, dateFrom, dateTo]);

  const { data, isLoading } = useAuditAccessLog(filters, page, PAGE_SIZE);
  const entries = data?.entries ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Accessi all'Audit Log (audit-of-audit)
              </CardTitle>
              <CardDescription className="mt-1">
                Tracciamento di chi ha consultato o esportato i log. Ogni visualizzazione,
                export e timeline è registrata in modo append-only.
              </CardDescription>
            </div>
            <div className="text-right">
              <div className="text-2xl font-semibold tabular-nums">{total}</div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                accessi registrati
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <Select value={accessType} onValueChange={(v) => { setAccessType(v); setPage(0); }}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i tipi</SelectItem>
                <SelectItem value="console_view">Console</SelectItem>
                <SelectItem value="export">Export</SelectItem>
                <SelectItem value="entity_timeline">Timeline entità</SelectItem>
                <SelectItem value="unified_timeline">Timeline globale</SelectItem>
                <SelectItem value="dashboard">Dashboard</SelectItem>
                <SelectItem value="anomaly_check">Anomalie</SelectItem>
              </SelectContent>
            </Select>
            <DateRangeFilter
              fromDate={dateFrom}
              toDate={dateTo}
              onFromDateChange={(d) => { setDateFrom(d); setPage(0); }}
              onToDateChange={(d) => { setDateTo(d); setPage(0); }}
            />
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              Nessun accesso registrato per i filtri selezionati.
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[160px]">Quando</TableHead>
                    <TableHead className="w-[180px]">Utente</TableHead>
                    <TableHead className="w-[140px]">Tipo</TableHead>
                    <TableHead className="w-[100px]">Risultati</TableHead>
                    <TableHead>Filtri / Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((e) => {
                    const tone = ACCESS_TYPE_LABELS[e.access_type] ?? { label: e.access_type, tone: "outline" };
                    const filterStr = e.filters ? Object.entries(e.filters)
                      .filter(([, v]) => v !== null && v !== undefined && v !== "" && v !== "all")
                      .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
                      .join(" • ") : "";
                    return (
                      <TableRow key={e.id}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(e.accessed_at), "dd MMM yyyy HH:mm:ss", { locale: it })}
                        </TableCell>
                        <TableCell>
                          <div className="text-xs font-medium">
                            {e.accessed_by_display_name || e.accessed_by.slice(0, 8)}
                          </div>
                          {e.user_agent && (
                            <div className="text-[10px] text-muted-foreground truncate max-w-[180px]" title={e.user_agent}>
                              {e.user_agent.split(" ").slice(0, 3).join(" ")}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={tone.tone === "destructive" ? "destructive" : tone.tone === "secondary" ? "secondary" : "outline"}
                            className="text-[10px] uppercase"
                          >
                            {e.access_type === "export" && <Eye className="h-3 w-3 mr-1" />}
                            {tone.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="tabular-nums text-xs">
                          {e.result_count ?? "—"}
                        </TableCell>
                        <TableCell>
                          <div className="text-[11px] font-mono text-muted-foreground break-all">
                            {filterStr || "—"}
                          </div>
                          {e.reason && (
                            <div className="text-[11px] text-foreground/80 mt-0.5 italic">
                              {e.reason}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Pagina {page + 1} di {totalPages}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                  Precedente
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                  Successiva
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
