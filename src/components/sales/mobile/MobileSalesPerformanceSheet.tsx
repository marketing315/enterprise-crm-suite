/**
 * F5.2 — Mobile Sales Performance Sheet
 * Pattern stesso di MobilePerformanceHub: hero + Segmented periodo + KpiList + lista venditori.
 * Riusa gli stessi hook desktop (useSalespersonKpisV2/Aggregate) — zero RPC nuove.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  startOfMonth,
  endOfMonth,
  subMonths,
} from "date-fns";
import { AlertCircle, TrendingUp, Award, Receipt, Users, ChevronRight } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { useBrand } from "@/contexts/BrandContext";
import {
  useSalespersonKpisV2,
  useSalespersonKpisAggregate,
} from "@/hooks/useSalespersonKpisV2";
import { cn } from "@/lib/utils";

type Period = "this_month" | "last_month" | "last_30d";

const PERIOD_OPTIONS: ChipOption<Period>[] = [
  { value: "this_month", label: "Mese" },
  { value: "last_month", label: "Scorso" },
  { value: "last_30d", label: "30g" },
];

function resolveRange(p: Period): { from: Date; to: Date } {
  const now = new Date();
  if (p === "this_month") return { from: startOfMonth(now), to: endOfMonth(now) };
  if (p === "last_month") {
    const lm = subMonths(now, 1);
    return { from: startOfMonth(lm), to: endOfMonth(lm) };
  }
  return { from: new Date(now.getTime() - 30 * 86400_000), to: now };
}

function fmtEur(n: number | null | undefined): string {
  if (n == null) return "—";
  return `€ ${Number(n).toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
function fmtNum(n: number | null | undefined): string {
  if (n == null) return "—";
  return Number(n).toLocaleString("it-IT");
}
function fmtPct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${Number(n).toFixed(0)}%`;
}

function MobileSalesPerformanceSheet() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentBrand } = useBrand();
  const activeBrandId = currentBrand?.id ?? null;

  const [period, setPeriod] = useState<Period>("this_month");
  const { from, to } = useMemo(() => resolveRange(period), [period]);

  const kpisQ = useSalespersonKpisV2(activeBrandId, from, to);
  const aggQ = useSalespersonKpisAggregate(activeBrandId, from, to);

  const rows = useMemo(
    () => [...(kpisQ.data?.rows ?? [])].sort((a, b) => (b.lordo ?? 0) - (a.lordo ?? 0)),
    [kpisQ.data],
  );

  const handleRefresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["salesperson-kpis-v2"] }),
      queryClient.invalidateQueries({ queryKey: ["salesperson-kpis-aggregate"] }),
    ]);
  };

  if (!activeBrandId) {
    return (
      <div className="px-4 pt-6">
        <EmptyState
          icon={AlertCircle}
          title="Nessun brand selezionato"
          description="Seleziona un brand dalla barra in alto per vedere il foglio venditori."
        />
      </div>
    );
  }

  const agg = aggQ.data;
  const isLoading = kpisQ.isLoading || aggQ.isLoading;
  const isError = kpisQ.isError || aggQ.isError;

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="flex flex-col gap-4 pb-24">
        {/* Header */}
        <header className="sticky top-0 z-20 -mt-3 border-b border-border/40 bg-background/85 px-4 pb-3 pt-3 backdrop-blur">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight">Foglio venditori</h1>
            <p className="truncate text-xs text-muted-foreground">
              Vista ESITO appuntamenti · imponibile = lordo / 1,22
            </p>
          </div>
          <div className="mt-3">
            <Segmented<Period>
              options={PERIOD_OPTIONS}
              value={period}
              onChange={setPeriod}
              ariaLabel="Periodo"
              asTabs
              size="sm"
            />
          </div>
        </header>

        {/* KPI */}
        <section className="space-y-3 px-4" aria-label="KPI venditori">
          {isError ? (
            <ErrorState
              title="Errore caricamento KPI"
              description={
                kpisQ.error instanceof Error
                  ? kpisQ.error.message
                  : aggQ.error instanceof Error
                    ? aggQ.error.message
                    : undefined
              }
              onRetry={() => {
                void kpisQ.refetch();
                void aggQ.refetch();
              }}
            />
          ) : isLoading ? (
            <MobileListSkeleton count={4} />
          ) : !agg || rows.length === 0 ? (
            <EmptyState
              icon={TrendingUp}
              title="Nessun venditore nel periodo"
              description="Cambia periodo o verifica le configurazioni del brand."
            />
          ) : (
            <>
              <HeroMetricCard
                label="Lordo periodo"
                value={fmtEur(agg.lordo)}
                caption={`${fmtNum(agg.total_sellers)} venditori · ${fmtNum(agg.ordini_venduti)} ordini`}
                variant="primary"
              />
              <KpiList ariaLabel="KPI aggregati venditori">
                <MetricRow
                  title="Imponibile"
                  value={fmtEur(agg.imponibile)}
                  icon={<Receipt className="h-4 w-4" />}
                />
                <MetricRow
                  title="Bonus totale"
                  value={fmtEur(agg.bonus_totale)}
                  icon={<Award className="h-4 w-4" />}
                />
                <MetricRow
                  title="Appuntamenti eseguiti"
                  value={`${fmtNum(agg.appuntamenti_eseguiti)} / ${fmtNum(agg.appuntamenti_programmati)}`}
                  subtitle={
                    agg.appuntamenti_programmati > 0
                      ? `% esecuzione ${fmtPct((agg.appuntamenti_eseguiti / agg.appuntamenti_programmati) * 100)}`
                      : undefined
                  }
                  icon={<Users className="h-4 w-4" />}
                />
                <MetricRow
                  title="Consegnati nel periodo"
                  value={fmtNum(agg.consegnati_periodo)}
                  icon={<TrendingUp className="h-4 w-4" />}
                />
              </KpiList>

              <h2 className="mt-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Dettaglio per venditore
              </h2>
              <ul className="flex flex-col gap-2" aria-label="Venditori">
                {rows.map((r) => {
                  const initials = (r.full_name || r.email || "?")
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((s) => s[0]?.toUpperCase())
                    .join("");
                  return (
                    <li key={r.user_id}>
                      <button
                        type="button"
                        onClick={() => navigate(`/sales/performance-sheet/${r.user_id}`)}
                        className={cn(
                          "press-scale flex w-full items-center gap-3 rounded-2xl border border-border/60 bg-card p-3 text-left shadow-card",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        )}
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                          {initials || "?"}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {r.full_name ?? r.email ?? "—"}
                          </p>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span className="text-[11px] tabular-nums text-muted-foreground">
                              {fmtNum(r.ordini_venduti)} ord · esec {fmtPct(r.perc_esecuzione)}
                            </span>
                            {r.bonus?.tier_label && (
                              <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                                {r.bonus.tier_label}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold tabular-nums">{fmtEur(r.lordo)}</p>
                          <p className="text-[11px] tabular-nums text-muted-foreground">
                            Bonus {fmtEur(r.bonus?.bonus_amount ?? 0)}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      </div>
    </PullToRefresh>
  );
}

export default MobileSalesPerformanceSheet;
export { MobileSalesPerformanceSheet };
