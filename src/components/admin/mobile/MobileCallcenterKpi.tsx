/**
 * F5.2 — Mobile Call Center KPI page.
 * Riusa hook desktop (useCallcenterKpisOverview/ByOperator) — zero RPC nuove.
 */
import { useMemo, useState } from "react";
import { subDays, startOfDay, endOfDay } from "date-fns";
import {
  Ticket,
  UserCheck,
  CheckCircle,
  AlertCircle,
  Clock,
  Inbox,
  TrendingUp,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import {
  Segmented,
  HeroMetricCard,
  KpiList,
  MetricRow,
  MobileListSkeleton,
  EmptyState,
  ErrorState,
  PullToRefresh,
  type ChipOption,
} from "@/components/mobile";
import {
  useCallcenterKpisOverview,
  useCallcenterKpisByOperator,
} from "@/hooks/useCallcenterKpis";
import { cn } from "@/lib/utils";

type PeriodKey = "7d" | "30d" | "90d";

const PERIOD_OPTIONS: ChipOption<PeriodKey>[] = [
  { value: "7d", label: "7g" },
  { value: "30d", label: "30g" },
  { value: "90d", label: "90g" },
];
const PERIOD_DAYS: Record<PeriodKey, number> = { "7d": 7, "30d": 30, "90d": 90 };

function fmtMin(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return "—";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function MobileCallcenterKpi() {
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<PeriodKey>("30d");

  const { from, to } = useMemo(() => {
    const today = new Date();
    return {
      from: startOfDay(subDays(today, PERIOD_DAYS[period])),
      to: endOfDay(today),
    };
  }, [period]);

  const overviewQ = useCallcenterKpisOverview(from, to);
  const operatorsQ = useCallcenterKpisByOperator(from, to);

  const overview = overviewQ.data;
  const operators = useMemo(
    () =>
      [...(operatorsQ.data ?? [])].sort(
        (a, b) => (b.tickets_resolved ?? 0) - (a.tickets_resolved ?? 0),
      ),
    [operatorsQ.data],
  );

  const handleRefresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["callcenter-kpis-overview"] }),
      queryClient.invalidateQueries({ queryKey: ["callcenter-kpis-by-operator"] }),
    ]);
  };

  const isLoading = overviewQ.isLoading || operatorsQ.isLoading;
  const isError = overviewQ.isError || operatorsQ.isError;

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="flex flex-col gap-4 pb-24">
        {/* Header */}
        <header className="sticky top-0 z-20 -mt-3 border-b border-border/40 bg-background/85 px-4 pb-3 pt-3 backdrop-blur">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight">KPI Call Center</h1>
            <p className="truncate text-xs text-muted-foreground">
              Performance operativa e SLA
            </p>
          </div>
          <div className="mt-3">
            <Segmented<PeriodKey>
              options={PERIOD_OPTIONS}
              value={period}
              onChange={setPeriod}
              ariaLabel="Periodo"
              asTabs
              size="sm"
            />
          </div>
        </header>

        {/* KPI overview */}
        <section className="space-y-3 px-4" aria-label="KPI ticket">
          {isError ? (
            <ErrorState
              title="Errore caricamento KPI"
              description={
                overviewQ.error instanceof Error
                  ? overviewQ.error.message
                  : operatorsQ.error instanceof Error
                    ? operatorsQ.error.message
                    : undefined
              }
              onRetry={() => {
                void overviewQ.refetch();
                void operatorsQ.refetch();
              }}
            />
          ) : isLoading ? (
            <MobileListSkeleton count={4} />
          ) : !overview ? (
            <EmptyState
              icon={Inbox}
              title="Nessun dato nel periodo"
              description="Cambia periodo o verifica le configurazioni del brand."
            />
          ) : (
            <>
              <HeroMetricCard
                label="Ticket creati nel periodo"
                value={String(overview.tickets_created ?? 0)}
                caption={`Backlog ${overview.backlog_total ?? 0} · non assegnati ${overview.unassigned_now ?? 0}`}
                variant={
                  (overview.unassigned_now ?? 0) > 0 || (overview.backlog_total ?? 0) > 20
                    ? "negative"
                    : "primary"
                }
              />
              <KpiList ariaLabel="KPI ticket">
                <MetricRow
                  title="Presi in carico"
                  value={String(overview.tickets_assigned ?? 0)}
                  subtitle={`Avg ${fmtMin(overview.avg_time_to_assign_minutes)}`}
                  icon={<UserCheck className="h-4 w-4" />}
                />
                <MetricRow
                  title="Risolti"
                  value={String(overview.tickets_resolved ?? 0)}
                  subtitle={`Avg ${fmtMin(overview.avg_time_to_resolve_minutes)}`}
                  icon={<CheckCircle className="h-4 w-4" />}
                />
                <MetricRow
                  title="Backlog totale"
                  value={String(overview.backlog_total ?? 0)}
                  icon={<Ticket className="h-4 w-4" />}
                />
                <MetricRow
                  title="Non assegnati"
                  value={String(overview.unassigned_now ?? 0)}
                  icon={<AlertCircle className="h-4 w-4" />}
                  tone={(overview.unassigned_now ?? 0) > 0 ? "warning" : undefined}
                />
              </KpiList>
            </>
          )}
        </section>

        {/* Operatori */}
        <section className="space-y-2 px-4" aria-label="Performance operatori">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Performance operatori
          </h2>
          {isError ? null : isLoading ? (
            <MobileListSkeleton count={4} />
          ) : operators.length === 0 ? (
            <EmptyState
              icon={UserCheck}
              title="Nessun operatore"
              description="Nessun operatore con ticket nel periodo."
            />
          ) : (
            <ul className="flex flex-col gap-2" aria-label="Operatori">
              {operators.map((op) => {
                const initials = (op.full_name || op.email || "?")
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((s) => s[0]?.toUpperCase())
                  .join("");
                const isCallcenter = op.role === "callcenter";
                return (
                  <li key={op.user_id}>
                    <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-3 shadow-card">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                        {initials || "?"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {op.full_name || op.email}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="text-[11px] text-muted-foreground">
                            {isCallcenter ? "Call Center" : "Sales"}
                          </span>
                          <span className="text-[11px] tabular-nums text-muted-foreground">
                            <Clock className="mr-0.5 inline h-3 w-3 align-text-bottom" />
                            assegn. {fmtMin(op.avg_time_to_assign_minutes)} · risolto {fmtMin(op.avg_time_to_resolve_minutes)}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold tabular-nums">
                          {op.tickets_resolved}
                        </p>
                        <p
                          className={cn(
                            "text-[11px] tabular-nums",
                            op.backlog_current > 10
                              ? "text-destructive"
                              : op.backlog_current > 5
                                ? "text-warning"
                                : "text-muted-foreground",
                          )}
                        >
                          Backlog {op.backlog_current}
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Footnote */}
        <p className="px-4 pt-1 text-[11px] text-muted-foreground">
          <TrendingUp className="mr-1 inline h-3 w-3 align-text-bottom" />
          Telefonia disponibile sulla vista desktop.
        </p>
      </div>
    </PullToRefresh>
  );
}

export default MobileCallcenterKpi;
export { MobileCallcenterKpi };
