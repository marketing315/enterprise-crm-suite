/**
 * F5.4 — Mobile Company Overview (/azienda)
 * Riepilogo finanziario mobile-first. Riusa useFinanceKpis/useExpenses.
 */
import { useMemo, useState } from "react";
import {
  endOfMonth,
  startOfMonth,
  subMonths,
  format,
} from "date-fns";
import { it } from "date-fns/locale";
import {
  AlertCircle,
  DollarSign,
  Receipt,
  ShieldAlert,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import {
  Segmented,
  HeroMetricCard,
  KpiList,
  MetricRow,
  EmptyState,
  MobileListSkeleton,
  PullToRefresh,
  type ChipOption,
} from "@/components/mobile";
import { useBrand } from "@/contexts/BrandContext";
import {
  useFinanceKpis,
  useExpenses,
  useHasFinanceAccess,
} from "@/hooks/useCompanyFinance";

type Period = "1" | "3" | "6" | "12";

const PERIOD_OPTIONS: ChipOption<Period>[] = [
  { value: "1", label: "1m" },
  { value: "3", label: "3m" },
  { value: "6", label: "6m" },
  { value: "12", label: "12m" },
];

function fmtEur(n: number): string {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n || 0);
}

function MobileCompanyOverview() {
  const queryClient = useQueryClient();
  const { currentBrand, hasBrandSelected } = useBrand();
  const hasAccess = useHasFinanceAccess();

  const [period, setPeriod] = useState<Period>("1");

  const dateRange = useMemo(() => {
    const months = parseInt(period, 10);
    const to = endOfMonth(new Date());
    const from = startOfMonth(subMonths(new Date(), months - 1));
    return { from, to };
  }, [period]);

  const kpisQ = useFinanceKpis(dateRange.from, dateRange.to);
  const expensesQ = useExpenses(dateRange.from, dateRange.to);

  const handleRefresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["finance-kpis"] }),
      queryClient.invalidateQueries({ queryKey: ["expenses"] }),
    ]);
  };

  if (!hasBrandSelected) {
    return (
      <div className="px-4 pt-6">
        <EmptyState
          icon={AlertCircle}
          title="Nessun brand selezionato"
          description="Seleziona un brand dalla barra in alto per vedere l'overview aziendale."
        />
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="px-4 pt-6">
        <EmptyState
          icon={ShieldAlert}
          title="Accesso negato"
          description="Richiedi accesso al ruolo Amministrazione per consultare questi dati."
        />
      </div>
    );
  }

  const kpis = kpisQ.data;
  const budgetVariance = kpis ? kpis.budget_total - kpis.total_expenses : 0;
  const budgetVariancePct =
    kpis && kpis.budget_total > 0
      ? ((budgetVariance / kpis.budget_total) * 100).toFixed(1)
      : "0";

  const topCats = kpis?.expenses_by_category?.slice(0, 5) ?? [];
  const expenses = expensesQ.data?.slice(0, 10) ?? [];

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="flex flex-col gap-4 pb-24">
        {/* Header */}
        <header className="sticky top-0 z-20 -mt-3 border-b border-border/40 bg-background/85 px-4 pb-3 pt-3 backdrop-blur">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight">Overview aziendale</h1>
            <p className="truncate text-xs text-muted-foreground">
              {currentBrand?.name} · riepilogo finanziario
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
        <section className="space-y-3 px-4" aria-label="KPI finanziari">
          {kpisQ.isLoading ? (
            <MobileListSkeleton count={4} />
          ) : kpis ? (
            <>
              <HeroMetricCard
                label="Margine"
                value={fmtEur(kpis.margin)}
                caption={`Vendite ${fmtEur(kpis.sales_total)} · costi ${fmtEur(kpis.total_expenses)}`}
                variant={kpis.margin >= 0 ? "primary" : "negative"}
              />
              <KpiList ariaLabel="KPI aziendali">
                <MetricRow
                  title="Vendite"
                  value={fmtEur(kpis.sales_total)}
                  subtitle="Deal vinti nel periodo"
                  icon={<DollarSign className="h-4 w-4" />}
                />
                <MetricRow
                  title="Costi"
                  value={fmtEur(kpis.total_expenses)}
                  subtitle="Totale spese registrate"
                  icon={<Receipt className="h-4 w-4" />}
                  tone="warning"
                />
                <MetricRow
                  title="Budget vs Actual"
                  value={`${budgetVariancePct}%`}
                  subtitle={budgetVariance >= 0 ? "Sotto budget" : "Sopra budget"}
                  icon={<Target className="h-4 w-4" />}
                  tone={budgetVariance >= 0 ? "positive" : "negative"}
                />
                <MetricRow
                  title="Tendenza margine"
                  value={kpis.margin >= 0 ? "Positivo" : "Negativo"}
                  icon={
                    kpis.margin >= 0 ? (
                      <TrendingUp className="h-4 w-4" />
                    ) : (
                      <TrendingDown className="h-4 w-4" />
                    )
                  }
                  tone={kpis.margin >= 0 ? "positive" : "negative"}
                />
              </KpiList>
            </>
          ) : null}
        </section>

        {/* Costi per categoria */}
        {topCats.length > 0 && (
          <section className="space-y-2 px-4" aria-label="Costi per categoria">
            <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Top categorie di costo
            </h2>
            <ul className="flex flex-col gap-2">
              {topCats.map((c) => {
                const total = kpis?.total_expenses || 0;
                const pct = total > 0 ? Math.round((c.amount / total) * 100) : 0;
                return (
                  <li
                    key={c.category_name}
                    className="flex items-center justify-between rounded-2xl border border-border/60 bg-card p-3 shadow-card"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{c.category_name}</p>
                      <p className="text-[11px] text-muted-foreground">{pct}% del totale</p>
                    </div>
                    <p className="text-sm font-semibold tabular-nums">{fmtEur(c.amount)}</p>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Ultimi costi */}
        <section className="space-y-2 px-4" aria-label="Ultimi costi">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Ultimi costi
          </h2>
          {expensesQ.isLoading ? (
            <MobileListSkeleton count={4} />
          ) : expenses.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="Nessun costo nel periodo"
              description="Cambia il periodo o registra un nuovo costo dal desktop."
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {expenses.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card p-3 shadow-card"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {e.expense_categories?.name || "Senza categoria"}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {format(new Date(e.expense_date), "d MMM yyyy", { locale: it })}
                      {e.vendor_name ? ` · ${e.vendor_name}` : ""}
                      {e.description ? ` · ${e.description}` : ""}
                    </p>
                  </div>
                  <p className="text-sm font-semibold tabular-nums">{fmtEur(e.amount)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </PullToRefresh>
  );
}

export default MobileCompanyOverview;
export { MobileCompanyOverview };
