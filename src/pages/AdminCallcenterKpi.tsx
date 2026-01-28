import { useState } from "react";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { it } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { CalendarIcon, Ticket, UserCheck, CheckCircle, AlertCircle, Users, Download, Headphones } from "lucide-react";
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
    if (minutes < 60) return `${Math.round(minutes)}m`;
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
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-lg bg-primary/10">
            <Headphones className="h-4 w-4 md:h-5 md:w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg md:text-2xl font-bold">KPI Call Center</h1>
            <p className="text-xs md:text-sm text-muted-foreground">
              Performance operativa e metriche SLA
            </p>
          </div>
        </div>

        {/* Controls - stacked on mobile */}
        <div className="flex flex-col sm:flex-row gap-2">
          {/* Date Range Picker */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="justify-start text-left font-normal text-sm">
                <CalendarIcon className="mr-2 h-4 w-4" />
                <span className="truncate">
                  {format(dateRange.from, "dd MMM", { locale: it })} -{" "}
                  {format(dateRange.to, "dd MMM yy", { locale: it })}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
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
                numberOfMonths={1}
                locale={it}
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>

          {/* Quick filters + Export */}
          <div className="flex gap-1 flex-wrap">
            {[7, 30, 90].map((days) => (
              <Button
                key={days}
                variant="ghost"
                size="sm"
                className="px-2"
                onClick={() =>
                  setDateRange({
                    from: startOfDay(subDays(new Date(), days)),
                    to: endOfDay(new Date()),
                  })
                }
              >
                {days}g
              </Button>
            ))}
            <div className="flex gap-1 ml-auto sm:ml-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportOverview}
                disabled={!overview || isLoadingOverview}
              >
                <Download className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportOperators}
                disabled={operatorKpis.length === 0 || isLoadingOperators}
              >
                <Users className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 md:p-6 md:pb-2">
            <CardTitle className="text-xs md:text-sm font-medium">Ticket Aperti</CardTitle>
            <Ticket className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
            {isLoadingOverview ? (
              <Skeleton className="h-7 w-12" />
            ) : (
              <div className="text-xl md:text-2xl font-bold">{overview?.tickets_created ?? 0}</div>
            )}
            <p className="text-[10px] md:text-xs text-muted-foreground">Nel periodo</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 md:p-6 md:pb-2">
            <CardTitle className="text-xs md:text-sm font-medium">Presi in Carico</CardTitle>
            <UserCheck className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
            {isLoadingOverview ? (
              <Skeleton className="h-7 w-12" />
            ) : (
              <div className="text-xl md:text-2xl font-bold">{overview?.tickets_assigned ?? 0}</div>
            )}
            <p className="text-[10px] md:text-xs text-muted-foreground truncate">
              Avg: {formatMinutesDisplay(overview?.avg_time_to_assign_minutes ?? 0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 md:p-6 md:pb-2">
            <CardTitle className="text-xs md:text-sm font-medium">Risolti</CardTitle>
            <CheckCircle className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
            {isLoadingOverview ? (
              <Skeleton className="h-7 w-12" />
            ) : (
              <div className="text-xl md:text-2xl font-bold">{overview?.tickets_resolved ?? 0}</div>
            )}
            <p className="text-[10px] md:text-xs text-muted-foreground truncate">
              Avg: {formatMinutesDisplay(overview?.avg_time_to_resolve_minutes ?? 0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 md:p-6 md:pb-2">
            <CardTitle className="text-xs md:text-sm font-medium">Backlog</CardTitle>
            <AlertCircle className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
            {isLoadingOverview ? (
              <Skeleton className="h-7 w-12" />
            ) : (
              <>
                <div className="text-xl md:text-2xl font-bold">{overview?.backlog_total ?? 0}</div>
                <p className="text-[10px] md:text-xs text-muted-foreground">
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
        <CardHeader className="p-4 md:p-6">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 md:h-5 md:w-5" />
            <div>
              <CardTitle className="text-base md:text-lg">Performance Operatori</CardTitle>
              <CardDescription className="text-xs md:text-sm">Metriche per singolo operatore</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 md:p-6 md:pt-0">
          {isLoadingOperators ? (
            <div className="space-y-2 p-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : operatorKpis.length === 0 ? (
            <p className="text-muted-foreground text-center py-8 text-sm">
              Nessun operatore configurato
            </p>
          ) : (
            <ScrollArea className="w-full">
              <div className="min-w-[600px]">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-3 text-xs md:text-sm font-medium">Operatore</th>
                      <th className="text-left p-3 text-xs md:text-sm font-medium">Ruolo</th>
                      <th className="text-right p-3 text-xs md:text-sm font-medium">Assegnati</th>
                      <th className="text-right p-3 text-xs md:text-sm font-medium">Risolti</th>
                      <th className="text-right p-3 text-xs md:text-sm font-medium">Avg Assign</th>
                      <th className="text-right p-3 text-xs md:text-sm font-medium">Avg Resolve</th>
                      <th className="text-right p-3 text-xs md:text-sm font-medium">Backlog</th>
                    </tr>
                  </thead>
                  <tbody>
                    {operatorKpis.map((op) => (
                      <tr key={op.user_id} className="border-t">
                        <td className="p-3 font-medium text-sm">
                          {op.full_name || op.email}
                        </td>
                        <td className="p-3">
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                              op.role === "callcenter"
                                ? "bg-primary/10 text-primary"
                                : "bg-secondary text-secondary-foreground"
                            )}
                          >
                            {op.role === "callcenter" ? "CC" : "Sales"}
                          </span>
                        </td>
                        <td className="p-3 text-right text-sm">{op.tickets_assigned}</td>
                        <td className="p-3 text-right text-sm">{op.tickets_resolved}</td>
                        <td className="p-3 text-right text-sm">
                          {formatMinutesDisplay(op.avg_time_to_assign_minutes)}
                        </td>
                        <td className="p-3 text-right text-sm">
                          {formatMinutesDisplay(op.avg_time_to_resolve_minutes)}
                        </td>
                        <td className="p-3 text-right">
                          <span
                            className={cn(
                              "font-medium text-sm",
                              op.backlog_current > 10
                                ? "text-destructive"
                                : op.backlog_current > 5
                                ? "text-amber-600 dark:text-amber-400"
                                : ""
                            )}
                          >
                            {op.backlog_current}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
