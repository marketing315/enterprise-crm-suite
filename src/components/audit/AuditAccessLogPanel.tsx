import { useState, useMemo } from "react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Loader2, ChevronLeft, ChevronRight, Eye, Download, BarChart3, Clock, ShieldAlert } from "lucide-react";
import { useAuditAccessLog, type AuditAccessFilters } from "@/hooks/useAuditAccessLog";
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateRangeFilter } from "@/components/contacts/DateRangeFilter";

const ACCESS_TYPES: { value: string; label: string; icon: typeof Eye }[] = [
  { value: "all", label: "Tutti gli accessi", icon: Eye },
  { value: "console_view", label: "Console", icon: Eye },
  { value: "export", label: "Export CSV", icon: Download },
  { value: "dashboard", label: "Dashboard", icon: BarChart3 },
  { value: "anomaly_check", label: "Alert", icon: ShieldAlert },
  { value: "entity_timeline", label: "Timeline entità", icon: Clock },
  { value: "unified_timeline", label: "Timeline unificata", icon: Clock },
];

const ACCESS_TYPE_LABELS: Record<string, string> = ACCESS_TYPES.reduce(
  (acc, t) => ({ ...acc, [t.value]: t.label }),
  {},
);

const ACCESS_TYPE_VARIANTS: Record<string, string> = {
  console_view: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30",
  export: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
  dashboard: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30",
  anomaly_check: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30",
  entity_timeline: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  unified_timeline: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
};

export function AuditAccessLogPanel() {
  const [page, setPage] = useState(0);
  const [accessType, setAccessType] = useState("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();

  const filters: AuditAccessFilters = useMemo(
    () => ({
      dateFrom,
      dateTo,
      accessType: accessType === "all" ? undefined : accessType,
    }),
    [dateFrom, dateTo, accessType],
  );

  const { data, isLoading, error } = useAuditAccessLog(filters, page);
  const events = data?.events ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 50));
  const byType = data?.by_access_type ?? [];
  const topUsers = data?.top_users ?? [];

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Accesso negato. Solo amministratori e CEO possono visualizzare il registro accessi.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Audit-of-Audit</h2>
        <p className="text-sm text-muted-foreground">
          Registro di chi ha consultato, esportato o analizzato i log audit ({total} eventi nel periodo)
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Per tipo di accesso</CardTitle>
          </CardHeader>
          <CardContent>
            {byType.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nessun dato</p>
            ) : (
              <div className="space-y-2">
                {byType.map((row) => (
                  <div key={row.access_type} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {ACCESS_TYPE_LABELS[row.access_type] || row.access_type}
                    </span>
                    <Badge variant="secondary">{row.count}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Top utenti</CardTitle>
          </CardHeader>
          <CardContent>
            {topUsers.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nessun dato</p>
            ) : (
              <div className="space-y-2">
                {topUsers.slice(0, 5).map((u) => (
                  <div key={u.user_id} className="flex items-center justify-between text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{u.display_name ?? u.user_id.slice(0, 8)}</div>
                      <div className="text-xs text-muted-foreground">
                        Ultimo: {format(new Date(u.last_access_at), "dd MMM HH:mm", { locale: it })}
                      </div>
                    </div>
                    <Badge variant="secondary">{u.count}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={accessType}
          onValueChange={(v) => {
            setAccessType(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACCESS_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DateRangeFilter
          fromDate={dateFrom}
          toDate={dateTo}
          onFromDateChange={(d) => {
            setDateFrom(d);
            setPage(0);
          }}
          onToDateChange={(d) => {
            setDateTo(d);
            setPage(0);
          }}
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : events.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">
          Nessun accesso registrato nel periodo
        </p>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[160px]">Data</TableHead>
                <TableHead className="w-[180px]">Utente</TableHead>
                <TableHead className="w-[140px]">Tipo accesso</TableHead>
                <TableHead className="w-[100px]">Risultati</TableHead>
                <TableHead>Filtri / Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((event) => {
                const filterEntries = Object.entries(event.filters || {})
                  .filter(([, v]) => v !== null && v !== undefined && v !== "")
                  .slice(0, 5);
                return (
                  <TableRow key={event.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(event.accessed_at), "dd MMM yyyy HH:mm:ss", { locale: it })}
                    </TableCell>
                    <TableCell className="text-sm">
                      <div className="truncate max-w-[180px]">
                        {event.accessed_by_display_name ?? event.accessed_by.slice(0, 8)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-xs ${ACCESS_TYPE_VARIANTS[event.access_type] ?? ""}`}
                      >
                        {ACCESS_TYPE_LABELS[event.access_type] || event.access_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {event.result_count ?? "—"}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5">
                        {event.reason && (
                          <div className="text-xs italic text-muted-foreground">{event.reason}</div>
                        )}
                        {filterEntries.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {filterEntries.map(([k, v]) => (
                              <Badge key={k} variant="secondary" className="text-[10px] font-normal">
                                {k}: {String(v).slice(0, 30)}
                              </Badge>
                            ))}
                          </div>
                        )}
                        {!event.reason && filterEntries.length === 0 && (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
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
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
              Precedente
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              Successiva
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
