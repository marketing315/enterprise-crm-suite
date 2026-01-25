import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import { useTicketTrendDashboard } from "@/hooks/useTicketTrend";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <Building2 className="h-16 w-16 text-muted-foreground mb-4" />
        <h2 className="text-2xl font-bold mb-2">Seleziona un Brand</h2>
        <p className="text-muted-foreground max-w-md">
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Trend Ticket</h1>
          <p className="text-muted-foreground">
            Analisi e trend del sistema ticketing per {currentBrand?.name}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          {/* Date Range Picker */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="justify-start text-left font-normal">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(dateRange.from, "dd MMM", { locale: it })} -{" "}
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
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>

          {/* Quick filters */}
          <div className="flex gap-1">
            {[7, 30, 90].map((days) => (
              <Button
                key={days}
                variant="ghost"
                size="sm"
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
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[100px]" />
          ))}
        </div>
      ) : summary ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Creati</CardTitle>
              <Inbox className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.total_created}</div>
              <p className="text-xs text-muted-foreground">nel periodo</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Risolti</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.total_resolved}</div>
              <p className="text-xs text-muted-foreground">
                {resolutionRate}% tasso risoluzione
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Backlog</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.current_backlog}</div>
              <p className="text-xs text-muted-foreground">ticket aperti ora</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Non Assegnati</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className={cn(
                "text-2xl font-bold",
                summary.current_unassigned > 0 && "text-destructive"
              )}>
                {summary.current_unassigned}
              </div>
              <p className="text-xs text-muted-foreground">da assegnare</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Flusso</CardTitle>
              {summary.total_resolved >= summary.total_created ? (
                <TrendingUp className="h-4 w-4 text-chart-3" />
              ) : (
                <TrendingDown className="h-4 w-4 text-destructive" />
              )}
            </CardHeader>
            <CardContent>
              <div className={cn(
                "text-2xl font-bold",
                summary.total_resolved >= summary.total_created
                  ? "text-chart-3"
                  : "text-destructive"
              )}>
                {summary.total_resolved >= summary.total_created ? "+" : ""}
                {summary.total_resolved - summary.total_created}
              </div>
              <p className="text-xs text-muted-foreground">
                risolti - creati
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Charts */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-[300px] lg:col-span-2" />
          <Skeleton className="h-[300px]" />
          <Skeleton className="h-[250px] lg:col-span-2" />
          <Skeleton className="h-[250px]" />
        </div>
      ) : data ? (
        <TicketTrendCharts data={data} />
      ) : null}

      {/* Operator Breakdown Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Performance Operatori
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-[200px]" />
          ) : data?.operator_breakdown && data.operator_breakdown.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Operatore</TableHead>
                  <TableHead className="text-right">Assegnati</TableHead>
                  <TableHead className="text-right">Risolti</TableHead>
                  <TableHead className="text-right">Tempo Medio</TableHead>
                  <TableHead className="text-right">Backlog</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.operator_breakdown.map((op) => (
                  <TableRow key={op.user_id}>
                    <TableCell>
                      <div className="font-medium">
                        {op.full_name || op.email}
                      </div>
                      {op.full_name && (
                        <div className="text-xs text-muted-foreground">
                          {op.email}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {op.assigned_count}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {op.resolved_count}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMinutesDisplay(op.avg_resolution_minutes)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant={op.current_backlog > 5 ? "destructive" : "secondary"}
                      >
                        {op.current_backlog}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              Nessun operatore trovato per questo brand
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
