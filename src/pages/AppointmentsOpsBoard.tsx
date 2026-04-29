import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays, format } from "date-fns";
import { it } from "date-fns/locale";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Calendar as CalendarIcon,
  CheckCircle2,
  ClipboardList,
  Download,
  RefreshCw,
  TrendingDown,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { exportAppointmentsCsv } from "@/features/appointments/exportAppointmentsCsv";
import { useBrand } from "@/contexts/BrandContext";
import { useAppointmentsOpsKpi } from "@/features/appointments/useAppointmentsOpsKpi";
import { useAppointments } from "@/hooks/useAppointments";
import { RiskScoreBadge } from "@/features/appointments/RiskScoreBadge";
import {
  APPOINTMENT_OUTCOMES,
  APPOINTMENT_STATUS,
  type AppointmentOutcomeCode,
  type AppointmentStatus,
  getStatusMeta,
} from "@/features/appointments/taxonomy";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type RangeKey = "week" | "month" | "30d";

const RANGE_OPTIONS: { value: RangeKey; label: string }[] = [
  { value: "week", label: "Settimana corrente" },
  { value: "month", label: "Mese corrente" },
  { value: "30d", label: "Ultimi 30 giorni" },
];

function getRange(key: RangeKey) {
  const now = new Date();
  if (key === "week") {
    return {
      from: startOfWeek(now, { weekStartsOn: 1 }),
      to: endOfWeek(now, { weekStartsOn: 1 }),
    };
  }
  if (key === "month") {
    return { from: startOfMonth(now), to: endOfMonth(now) };
  }
  return { from: subDays(now, 30), to: now };
}

export default function AppointmentsOpsBoard() {
  const navigate = useNavigate();
  const { currentBrand } = useBrand();
  const [range, setRange] = useState<RangeKey>("month");

  const { from, to } = useMemo(() => getRange(range), [range]);
  const dateFrom = from.toISOString();
  const dateTo = to.toISOString();

  const { data: kpi, isLoading, refetch, isFetching } = useAppointmentsOpsKpi({
    brandId: currentBrand?.id,
    dateFrom,
    dateTo,
  });

  // Lista appuntamenti a rischio (prossime 48h, scheduled/draft)
  const next48hFrom = useMemo(() => new Date().toISOString(), []);
  const next48hTo = useMemo(
    () => new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    []
  );
  const { data: atRiskData } = useAppointments({
    dateFrom: next48hFrom,
    dateTo: next48hTo,
  });
  const atRiskList = useMemo(
    () =>
      (atRiskData?.appointments ?? [])
        .filter((a) => (a.status as string) === "scheduled" || (a.status as string) === "draft")
        .slice(0, 8),
    [atRiskData]
  );

  // Dataset completo del periodo per export CSV
  const { data: periodData, isFetching: isExportLoading } = useAppointments({
    dateFrom,
    dateTo,
  });

  const handleExport = () => {
    const list = periodData?.appointments ?? [];
    if (list.length === 0) {
      toast.info("Nessun appuntamento da esportare nel periodo selezionato");
      return;
    }
    const stamp = `${format(from, "yyyyMMdd")}-${format(to, "yyyyMMdd")}`;
    const n = exportAppointmentsCsv(list, `ops-board-${stamp}`);
    toast.success(`Esportati ${n} appuntamenti`);
  };

  return (
    <div className="flex h-full flex-col gap-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/appointments")}
            className="rounded-xl"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
            <Activity className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              Ops Board appuntamenti
            </h1>
            <p className="text-sm text-muted-foreground">
              {format(from, "d MMM", { locale: it })} –{" "}
              {format(to, "d MMM yyyy", { locale: it })}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
            <SelectTrigger className="w-[200px] rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            className="rounded-xl"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard
          label="Totale"
          value={isLoading ? null : kpi?.total ?? 0}
          icon={CalendarIcon}
          tone="default"
        />
        <KpiCard
          label="Tasso esecuzione"
          value={isLoading ? null : `${kpi?.execution_rate ?? 0}%`}
          subtitle={`${kpi?.executed_count ?? 0} eseguiti`}
          icon={CheckCircle2}
          tone="success"
        />
        <KpiCard
          label="Tasso no-show"
          value={isLoading ? null : `${kpi?.no_show_rate ?? 0}%`}
          subtitle={`${kpi?.no_show_count ?? 0} no-show`}
          icon={TrendingDown}
          tone={
            (kpi?.no_show_rate ?? 0) > 15
              ? "danger"
              : (kpi?.no_show_rate ?? 0) > 8
              ? "warning"
              : "success"
          }
        />
        <KpiCard
          label="A rischio · 48h"
          value={isLoading ? null : kpi?.at_risk_next_48h ?? 0}
          subtitle="Non confermati"
          icon={AlertTriangle}
          tone={(kpi?.at_risk_next_48h ?? 0) > 0 ? "warning" : "default"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Status breakdown */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">
              Distribuzione status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : Object.keys(kpi?.status_breakdown ?? {}).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessun dato.</p>
            ) : (
              Object.entries(kpi!.status_breakdown)
                .sort((a, b) => b[1] - a[1])
                .map(([code, count]) => {
                  const meta =
                    APPOINTMENT_STATUS[code as AppointmentStatus];
                  const total = kpi!.total || 1;
                  const pct = Math.round((count / total) * 100);
                  return (
                    <div key={code} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium">
                          {meta?.label ?? code}
                        </span>
                        <span className="text-muted-foreground">
                          {count} · {pct}%
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })
            )}
          </CardContent>
        </Card>

        {/* Outcome breakdown */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Esiti registrati</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : Object.keys(kpi?.outcome_breakdown ?? {}).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nessun esito registrato nel periodo.
              </p>
            ) : (
              Object.entries(kpi!.outcome_breakdown)
                .sort((a, b) => b[1] - a[1])
                .map(([code, count]) => {
                  const meta =
                    APPOINTMENT_OUTCOMES[code as AppointmentOutcomeCode];
                  const Icon = meta?.icon;
                  return (
                    <div
                      key={code}
                      className="flex items-center justify-between rounded-lg border bg-card/50 px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
                        <span className="text-sm">{meta?.label ?? code}</span>
                      </div>
                      <Badge variant="secondary" className="rounded-md">
                        {count}
                      </Badge>
                    </div>
                  );
                })
            )}
          </CardContent>
        </Card>

        {/* Follow-up + Risk score */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">
              Follow-up & rischio
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border bg-card/50 p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ClipboardList className="h-3.5 w-3.5" />
                Follow-up pendenti (7gg)
              </div>
              <div className="mt-1 text-2xl font-semibold">
                {kpi?.pending_follow_up ?? 0}
              </div>
            </div>
            <div className="rounded-lg border bg-card/50 p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Users className="h-3.5 w-3.5" />
                Risk score medio
              </div>
              <div className="mt-1 text-2xl font-semibold">
                {kpi?.avg_risk_score ?? 0}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* At-risk list */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold">
            Appuntamenti a rischio · prossime 48h
          </CardTitle>
          <Badge variant="outline">{atRiskList.length}</Badge>
        </CardHeader>
        <CardContent>
          {atRiskList.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nessun appuntamento non confermato nelle prossime 48h. 🎯
            </p>
          ) : (
            <div className="divide-y">
              {atRiskList.map((apt) => {
                const dt = new Date(apt.scheduled_at);
                const name =
                  [apt.contact?.first_name, apt.contact?.last_name]
                    .filter(Boolean)
                    .join(" ") || "Contatto";
                const statusMeta =
                  APPOINTMENT_STATUS[apt.status as AppointmentStatus];
                return (
                  <button
                    key={apt.id}
                    onClick={() => navigate(`/appointments/${apt.id}`)}
                    className="flex w-full items-center justify-between gap-3 py-3 text-left transition hover:bg-muted/40 px-2 -mx-2 rounded-lg"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">{name}</span>
                        {statusMeta && (
                          <Badge
                            variant="outline"
                            className={cn("text-[10px]", statusMeta.badgeClass)}
                          >
                            {statusMeta.label}
                          </Badge>
                        )}
                        <RiskScoreBadge score={apt.risk_score} />
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {format(dt, "EEE d MMM 'alle' HH:mm", { locale: it })}
                        {apt.sales_user?.full_name &&
                          ` · ${apt.sales_user.full_name}`}
                      </div>
                    </div>
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface KpiCardProps {
  label: string;
  value: string | number | null;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "default" | "success" | "warning" | "danger";
}

function KpiCard({ label, value, subtitle, icon: Icon, tone = "default" }: KpiCardProps) {
  const toneClass = {
    default: "text-foreground",
    success: "text-emerald-600 dark:text-emerald-400",
    warning: "text-amber-600 dark:text-amber-400",
    danger: "text-destructive",
  }[tone];

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {label}
          </div>
          <Icon className={cn("h-4 w-4", toneClass)} />
        </div>
        <div className={cn("mt-2 text-2xl font-semibold", toneClass)}>
          {value === null ? <Skeleton className="h-8 w-16" /> : value}
        </div>
        {subtitle && (
          <div className="mt-0.5 text-xs text-muted-foreground">{subtitle}</div>
        )}
      </CardContent>
    </Card>
  );
}
