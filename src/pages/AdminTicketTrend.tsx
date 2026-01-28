import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import { useTicketTrendDashboard } from "@/hooks/useTicketTrend";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { TicketTrendCharts } from "@/components/admin/TicketTrendCharts";
import { cn } from "@/lib/utils";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { it } from "date-fns/locale";
import {
  Building2,
  CalendarIcon,
  TrendingUp,
  TrendingDown,
  Clock,
  Users,
  AlertTriangle,
  CheckCircle2,
  Inbox,
  LineChart,
} from "lucide-react";

function formatMinutesDisplay(minutes: number): string {
  if (minutes === 0) return "—";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

export default function AdminTicketTrend() {
  const { isAdmin, isCeo } = useAuth();
  const { hasBrandSelected, currentBrand } = useBrand();

  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: startOfDay(subDays(new Date(), 30)),
    to: endOfDay(new Date()),
  });

  const { data, isLoading } = useTicketTrendDashboard(dateRange.from, dateRange.to);

  // Access control: only admin and ceo
  if (!isAdmin && !isCeo) {
    return <Navigate to="/dashboard" replace />;
  }

  if (!hasBrandSelected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <Building2 className="h-12 w-12 md:h-16 md:w-16 text-muted-foreground mb-4" />
        <h2 className="text-xl md:text-2xl font-bold mb-2">Seleziona un Brand</h2>
        <p className="text-sm text-muted-foreground max-w-md">
          Utilizza il selettore nella sidebar per scegliere il brand.
        </p>
      </div>
    );
  }

  const summary = data?.summary;
  const resolutionRate = summary && summary.total_created > 0
    ? Math.round((summary.total_resolved / summary.total_created) * 100)
    : 0;

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-lg bg-primary/10">
            <LineChart className="h-4 w-4 md:h-5 md:w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg md:text-2xl font-bold">Trend Ticket</h1>
            <p className="text-xs md:text-sm text-muted-foreground">
              Analisi per {currentBrand?.name}
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap gap-2 items-center">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="justify-start text-left font-normal">
                <CalendarIcon className="mr-2 h-4 w-4" />
                <span className="text-sm">
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

          <div className="flex gap-1">
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
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      {isLoading ? (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[90px]" />
          ))}
        </div>
      ) : summary ? (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 md:p-6 md:pb-2">
              <CardTitle className="text-xs md:text-sm font-medium">Creati</CardTitle>
              <Inbox className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
              <div className="text-xl md:text-2xl font-bold">{summary.total_created}</div>
              <p className="text-[10px] md:text-xs text-muted-foreground">nel periodo</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 md:p-6 md:pb-2">
              <CardTitle className="text-xs md:text-sm font-medium">Risolti</CardTitle>
              <CheckCircle2 className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
              <div className="text-xl md:text-2xl font-bold">{summary.total_resolved}</div>
              <p className="text-[10px] md:text-xs text-muted-foreground">
                {resolutionRate}% tasso
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 md:p-6 md:pb-2">
              <CardTitle className="text-xs md:text-sm font-medium">Backlog</CardTitle>
              <Clock className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
              <div className="text-xl md:text-2xl font-bold">{summary.current_backlog}</div>
              <p className="text-[10px] md:text-xs text-muted-foreground">aperti ora</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 md:p-6 md:pb-2">
              <CardTitle className="text-xs md:text-sm font-medium">Non Assegnati</CardTitle>
              <AlertTriangle className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
              <div className={cn(
                "text-xl md:text-2xl font-bold",
                summary.current_unassigned > 0 && "text-destructive"
              )}>
                {summary.current_unassigned}
              </div>
              <p className="text-[10px] md:text-xs text-muted-foreground">da assegnare</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 md:p-6 md:pb-2">
              <CardTitle className="text-xs md:text-sm font-medium">Flusso</CardTitle>
              {summary.total_resolved >= summary.total_created ? (
                <TrendingUp className="h-3.5 w-3.5 md:h-4 md:w-4 text-chart-3" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5 md:h-4 md:w-4 text-destructive" />
              )}
            </CardHeader>
            <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
              <div className={cn(
                "text-xl md:text-2xl font-bold",
                summary.total_resolved >= summary.total_created
                  ? "text-chart-3"
                  : "text-destructive"
              )}>
                {summary.total_resolved >= summary.total_created ? "+" : ""}
                {summary.total_resolved - summary.total_created}
              </div>
              <p className="text-[10px] md:text-xs text-muted-foreground">
                risolti - creati
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Charts */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-[250px] lg:col-span-2" />
          <Skeleton className="h-[250px]" />
        </div>
      ) : data ? (
        <TicketTrendCharts data={data} />
      ) : null}

      {/* Operator Breakdown Table */}
      <Card>
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="flex items-center gap-2 text-base md:text-lg">
            <Users className="h-4 w-4 md:h-5 md:w-5" />
            Performance Operatori
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 md:p-6 md:pt-0">
          {isLoading ? (
            <Skeleton className="h-[150px] m-4" />
          ) : data?.operator_breakdown && data.operator_breakdown.length > 0 ? (
            <ScrollArea className="w-full">
              <div className="min-w-[500px]">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-3 text-xs md:text-sm font-medium">Operatore</th>
                      <th className="text-right p-3 text-xs md:text-sm font-medium">Assegnati</th>
                      <th className="text-right p-3 text-xs md:text-sm font-medium">Risolti</th>
                      <th className="text-right p-3 text-xs md:text-sm font-medium">Tempo Medio</th>
                      <th className="text-right p-3 text-xs md:text-sm font-medium">Backlog</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.operator_breakdown.map((op) => (
                      <tr key={op.user_id} className="border-t">
                        <td className="p-3">
                          <div className="font-medium text-sm truncate max-w-[150px]">
                            {op.full_name || op.email}
                          </div>
                        </td>
                        <td className="p-3 text-right tabular-nums text-sm">
                          {op.assigned_count}
                        </td>
                        <td className="p-3 text-right tabular-nums text-sm">
                          {op.resolved_count}
                        </td>
                        <td className="p-3 text-right tabular-nums text-sm">
                          {formatMinutesDisplay(op.avg_resolution_minutes)}
                        </td>
                        <td className="p-3 text-right">
                          <Badge
                            variant={op.current_backlog > 5 ? "destructive" : "secondary"}
                            className="text-xs"
                          >
                            {op.current_backlog}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          ) : (
            <p className="text-center text-muted-foreground py-8 text-sm">
              Nessun operatore trovato
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
