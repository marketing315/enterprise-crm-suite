import { useState } from "react";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { it } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarIcon, Ticket, UserCheck, CheckCircle, AlertCircle, Users, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useCallcenterKpisOverview,
  useCallcenterKpisByOperator,
} from "@/hooks/useCallcenterKpis";
import { CallcenterKpiCharts } from "@/components/admin/CallcenterKpiCharts";
import { useBrand } from "@/contexts/BrandContext";
import { arrayToCSV, downloadCSV, formatMinutesForCSV } from "@/lib/csvExport";
import { toast } from "sonner";

export default function AdminCallcenterKpi() {
  const { currentBrand } = useBrand();
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: startOfDay(subDays(new Date(), 30)),
    to: endOfDay(new Date()),
  });

  const { data: overview, isLoading: isLoadingOverview } = useCallcenterKpisOverview(
    dateRange.from,
    dateRange.to
  );
  const { data: operatorKpis = [], isLoading: isLoadingOperators } = useCallcenterKpisByOperator(
    dateRange.from,
    dateRange.to
  );

  const formatMinutesDisplay = (minutes: number): string => {
    if (minutes === 0) return "-";
    if (minutes < 60) return `${Math.round(minutes)} min`;
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const handleExportOverview = () => {
    if (!overview) return;
    
    const data = [{
      tickets_created: overview.tickets_created,
      tickets_assigned: overview.tickets_assigned,
      tickets_resolved: overview.tickets_resolved,
      avg_time_to_assign: formatMinutesForCSV(overview.avg_time_to_assign_minutes),
      avg_time_to_resolve: formatMinutesForCSV(overview.avg_time_to_resolve_minutes),
      backlog_total: overview.backlog_total,
      unassigned_now: overview.unassigned_now,
    }];

    const csv = arrayToCSV(data, [
      { key: "tickets_created", label: "Ticket Creati" },
      { key: "tickets_assigned", label: "Ticket Assegnati" },
      { key: "tickets_resolved", label: "Ticket Risolti" },
      { key: "avg_time_to_assign", label: "Tempo Medio Assegnazione" },
      { key: "avg_time_to_resolve", label: "Tempo Medio Risoluzione" },
      { key: "backlog_total", label: "Backlog Totale" },
      { key: "unassigned_now", label: "Non Assegnati" },
    ]);

    const fromStr = format(dateRange.from, "yyyy-MM-dd");
    const toStr = format(dateRange.to, "yyyy-MM-dd");
    const brandSlug = currentBrand?.slug || "brand";
    downloadCSV(csv, `kpi-overview_${brandSlug}_${fromStr}_${toStr}.csv`);
    toast.success("Export overview completato");
  };

  const handleExportOperators = () => {
    if (operatorKpis.length === 0) return;

    const data = operatorKpis.map((op) => ({
      operatore: op.full_name || op.email,
      ruolo: op.role === "callcenter" ? "Call Center" : "Sales",
      tickets_assigned: op.tickets_assigned,
      tickets_resolved: op.tickets_resolved,
      avg_time_to_assign: formatMinutesForCSV(op.avg_time_to_assign_minutes),
      avg_time_to_resolve: formatMinutesForCSV(op.avg_time_to_resolve_minutes),
      backlog_current: op.backlog_current,
    }));

    const csv = arrayToCSV(data, [
      { key: "operatore", label: "Operatore" },
      { key: "ruolo", label: "Ruolo" },
      { key: "tickets_assigned", label: "Assegnati" },
      { key: "tickets_resolved", label: "Risolti" },
      { key: "avg_time_to_assign", label: "Tempo Medio Assegnazione" },
      { key: "avg_time_to_resolve", label: "Tempo Medio Risoluzione" },
      { key: "backlog_current", label: "Backlog Attuale" },
    ]);

    const fromStr = format(dateRange.from, "yyyy-MM-dd");
    const toStr = format(dateRange.to, "yyyy-MM-dd");
    const brandSlug = currentBrand?.slug || "brand";
    downloadCSV(csv, `kpi-operatori_${brandSlug}_${fromStr}_${toStr}.csv`);
    toast.success("Export operatori completato");
  };
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">KPI Call Center</h1>
          <p className="text-muted-foreground">
            Performance operativa e metriche SLA
          </p>
        </div>

        {/* Date Range Picker */}
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-[280px] justify-start text-left font-normal">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(dateRange.from, "dd MMM yyyy", { locale: it })} -{" "}
                {format(dateRange.to, "dd MMM yyyy", { locale: it })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                selected={{ from: dateRange.from, to: dateRange.to }}
                onSelect={(range) => {
                  if (range?.from && range?.to) {
                    setDateRange({
                      from: startOfDay(range.from),
                      to: endOfDay(range.to),
                    });
                  }
                }}
                numberOfMonths={2}
                locale={it}
              />
            </PopoverContent>
          </Popover>

          {/* Quick filters */}
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setDateRange({
                  from: startOfDay(subDays(new Date(), 7)),
                  to: endOfDay(new Date()),
                })
              }
            >
              7g
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setDateRange({
                  from: startOfDay(subDays(new Date(), 30)),
                  to: endOfDay(new Date()),
                })
              }
            >
              30g
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setDateRange({
                  from: startOfDay(subDays(new Date(), 90)),
                  to: endOfDay(new Date()),
                })
              }
            >
              90g
            </Button>
          </div>

          {/* Export Buttons */}
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportOverview}
              disabled={!overview || isLoadingOverview}
            >
              <Download className="h-4 w-4 mr-1" />
              Overview
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportOperators}
              disabled={operatorKpis.length === 0 || isLoadingOperators}
            >
              <Download className="h-4 w-4 mr-1" />
              Operatori
            </Button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ticket Aperti</CardTitle>
            <Ticket className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingOverview ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{overview?.tickets_created ?? 0}</div>
            )}
            <p className="text-xs text-muted-foreground">Nel periodo selezionato</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Presi in Carico</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingOverview ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{overview?.tickets_assigned ?? 0}</div>
            )}
            <p className="text-xs text-muted-foreground">
              Tempo medio: {formatMinutesDisplay(overview?.avg_time_to_assign_minutes ?? 0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Risolti</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingOverview ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{overview?.tickets_resolved ?? 0}</div>
            )}
            <p className="text-xs text-muted-foreground">
              Tempo medio: {formatMinutesDisplay(overview?.avg_time_to_resolve_minutes ?? 0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Backlog Attuale</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingOverview ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <div className="text-2xl font-bold">{overview?.backlog_total ?? 0}</div>
                <p className="text-xs text-muted-foreground">
                  Non assegnati: {overview?.unassigned_now ?? 0}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      {overview && <CallcenterKpiCharts overview={overview} />}

      {/* Operator Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            <div>
              <CardTitle>Performance Operatori</CardTitle>
              <CardDescription>Metriche per singolo operatore nel periodo</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingOperators ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : operatorKpis.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              Nessun operatore call center configurato per questo brand
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Operatore</TableHead>
                  <TableHead>Ruolo</TableHead>
                  <TableHead className="text-right">Assegnati</TableHead>
                  <TableHead className="text-right">Risolti</TableHead>
                  <TableHead className="text-right">Avg Assign</TableHead>
                  <TableHead className="text-right">Avg Resolve</TableHead>
                  <TableHead className="text-right">Backlog</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {operatorKpis.map((op) => (
                  <TableRow key={op.user_id}>
                    <TableCell className="font-medium">
                      {op.full_name || op.email}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-1 text-xs font-medium",
                          op.role === "callcenter"
                            ? "bg-primary/10 text-primary"
                            : "bg-secondary text-secondary-foreground"
                        )}
                      >
                        {op.role === "callcenter" ? "Call Center" : "Sales"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">{op.tickets_assigned}</TableCell>
                    <TableCell className="text-right">{op.tickets_resolved}</TableCell>
                    <TableCell className="text-right">
                      {formatMinutesDisplay(op.avg_time_to_assign_minutes)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatMinutesDisplay(op.avg_time_to_resolve_minutes)}
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={cn(
                          "font-medium",
                          op.backlog_current > 10
                            ? "text-destructive"
                            : op.backlog_current > 5
                            ? "text-accent-foreground"
                            : ""
                        )}
                      >
                        {op.backlog_current}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
