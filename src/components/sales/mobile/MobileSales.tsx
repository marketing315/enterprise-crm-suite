/**
 * F5.4 — Mobile Sales (/sales)
 * Lista ordini mobile-first con KPI hero + segmented periodo.
 * Riusa useSalesOrders/useSalesKpis e SalesOrderDetailSheet/QuickSaleDialog desktop.
 */
import { useMemo, useState } from "react";
import { format, startOfMonth, endOfMonth, startOfDay, endOfDay, subDays } from "date-fns";
import { it } from "date-fns/locale";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ChevronRight,
  Euro,
  Plus,
  ShieldAlert,
  ShoppingCart,
  Sparkles,
  TrendingUp,
} from "lucide-react";

import {
  Segmented,
  HeroMetricCard,
  KpiList,
  MetricRow,
  EmptyState,
  ErrorState,
  MobileListSkeleton,
  PullToRefresh,
  type ChipOption,
} from "@/components/mobile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBrand } from "@/contexts/BrandContext";
import { useAuth } from "@/contexts/AuthContext";
import { useSalesOrders, useSalesKpis } from "@/hooks/useSalesOrders";
import { ORDER_STATUS_CONFIG, type SalesOrderStatus } from "@/types/sales";
import { SalesOrderDetailSheet } from "@/components/sales/SalesOrderDetailSheet";
import { QuickSaleDialog } from "@/components/sales/QuickSaleDialog";
import { cn } from "@/lib/utils";

type Period = "today" | "week" | "month" | "all";

const PERIOD_OPTIONS: ChipOption<Period>[] = [
  { value: "today", label: "Oggi" },
  { value: "week", label: "7g" },
  { value: "month", label: "Mese" },
  { value: "all", label: "Tutto" },
];

function resolveRange(p: Period): { from?: Date; to?: Date } {
  const now = new Date();
  if (p === "today") return { from: startOfDay(now), to: endOfDay(now) };
  if (p === "week") return { from: startOfDay(subDays(now, 7)), to: endOfDay(now) };
  if (p === "month") return { from: startOfMonth(now), to: endOfMonth(now) };
  return {};
}

function fmtEur(n: number): string {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n || 0);
}

function MobileSales() {
  const queryClient = useQueryClient();
  const { currentBrand, hasBrandSelected } = useBrand();
  const { isAdmin, isCeo, hasRole } = useAuth();

  const [period, setPeriod] = useState<Period>("month");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [quickSaleOpen, setQuickSaleOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<SalesOrderStatus | "all">("all");

  const range = useMemo(() => resolveRange(period), [period]);
  const now = new Date();
  const kpiFrom = startOfDay(subDays(now, 30));
  const kpiTo = endOfDay(now);

  const canView =
    isAdmin ||
    isCeo ||
    (!!currentBrand &&
      (hasRole("responsabile_venditori", currentBrand.id) ||
        hasRole("venditore", currentBrand.id)));

  const ordersQ = useSalesOrders({
    status: statusFilter !== "all" ? statusFilter : undefined,
    from: range.from,
    to: range.to,
  });
  const kpisQ = useSalesKpis(kpiFrom, kpiTo);

  const handleRefresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["sales-orders"] }),
      queryClient.invalidateQueries({ queryKey: ["sales-kpis"] }),
    ]);
  };

  if (!hasBrandSelected) {
    return (
      <div className="px-4 pt-6">
        <EmptyState
          icon={AlertCircle}
          title="Nessun brand selezionato"
          description="Seleziona un brand dalla barra in alto per vedere le vendite."
        />
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="px-4 pt-6">
        <EmptyState
          icon={ShieldAlert}
          title="Accesso negato"
          description="Non hai i permessi per visualizzare le vendite."
        />
      </div>
    );
  }

  const orders = ordersQ.data ?? [];
  const filtered = orders.filter((o) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const name = `${o.contact?.first_name || ""} ${o.contact?.last_name || ""}`.toLowerCase();
    return o.order_number.toLowerCase().includes(q) || name.includes(q);
  });

  return (
    <>
      <PullToRefresh onRefresh={handleRefresh}>
        <div className="flex flex-col gap-4 pb-24">
          {/* Header */}
          <header className="sticky top-0 z-20 -mt-3 border-b border-border/40 bg-background/85 px-4 pb-3 pt-3 backdrop-blur">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
                  <ShoppingCart className="h-5 w-5" /> Vendite
                </h1>
                <p className="truncate text-xs text-muted-foreground">
                  Ordini e pagamenti · {currentBrand?.name}
                </p>
              </div>
              <Button size="sm" onClick={() => setQuickSaleOpen(true)} className="gap-1">
                <Sparkles className="h-4 w-4" />
                <span className="text-xs">Rapida</span>
              </Button>
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
          <section className="space-y-3 px-4" aria-label="KPI vendite">
            {kpisQ.isLoading ? (
              <MobileListSkeleton count={3} />
            ) : kpisQ.data ? (
              <>
                <HeroMetricCard
                  label="Fatturato 30 giorni"
                  value={fmtEur(kpisQ.data.total_revenue)}
                  caption={`${kpisQ.data.total_orders} ordini · valore medio ${fmtEur(kpisQ.data.avg_order_value)}`}
                  variant="primary"
                />
                <KpiList ariaLabel="KPI ordini">
                  <MetricRow
                    title="Pagati"
                    value={String(kpisQ.data.orders_paid)}
                    subtitle={`${kpisQ.data.orders_pending} in attesa`}
                    icon={<Euro className="h-4 w-4" />}
                  />
                  <MetricRow
                    title="Tasso conversione"
                    value={`${kpisQ.data.conversion_rate}%`}
                    subtitle="Pagati / totali"
                    icon={<TrendingUp className="h-4 w-4" />}
                  />
                </KpiList>
              </>
            ) : null}
          </section>

          {/* Search + status chips */}
          <section className="space-y-2 px-4" aria-label="Filtri ordini">
            <Input
              placeholder="Cerca per numero o cliente…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Cerca ordini"
            />
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 no-scrollbar">
              <Button
                size="sm"
                variant={statusFilter === "all" ? "default" : "outline"}
                onClick={() => setStatusFilter("all")}
                className="shrink-0"
              >
                Tutti
              </Button>
              {(Object.entries(ORDER_STATUS_CONFIG) as [SalesOrderStatus, { label: string }][]).map(
                ([value, { label }]) => (
                  <Button
                    key={value}
                    size="sm"
                    variant={statusFilter === value ? "default" : "outline"}
                    onClick={() => setStatusFilter(value)}
                    className="shrink-0"
                  >
                    {label}
                  </Button>
                ),
              )}
            </div>
          </section>

          {/* Orders list */}
          <section className="space-y-2 px-4" aria-label="Ordini">
            {ordersQ.isError ? (
              <ErrorState
                title="Errore caricamento ordini"
                description={ordersQ.error instanceof Error ? ordersQ.error.message : undefined}
                onRetry={() => void ordersQ.refetch()}
              />
            ) : ordersQ.isLoading ? (
              <MobileListSkeleton count={6} />
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={ShoppingCart}
                title="Nessuna vendita"
                description="Cambia periodo o filtro stato, oppure crea una vendita rapida."
                action={
                  <Button size="sm" onClick={() => setQuickSaleOpen(true)} className="gap-1">
                    <Plus className="h-4 w-4" /> Vendita rapida
                  </Button>
                }
              />
            ) : (
              <ul className="flex flex-col gap-2" aria-label={`${filtered.length} ordini`}>
                {filtered.map((o) => {
                  const cfg = ORDER_STATUS_CONFIG[o.status];
                  return (
                    <li key={o.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedOrderId(o.id)}
                        className={cn(
                          "press-scale flex w-full items-center gap-3 rounded-2xl border border-border/60 bg-card p-3 text-left shadow-card",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-medium">{o.order_number}</p>
                            <Badge variant="secondary" className="h-5 px-2 text-[10px]">
                              {cfg.label}
                            </Badge>
                          </div>
                          <p className="truncate text-xs text-muted-foreground">
                            {o.contact?.first_name} {o.contact?.last_name} ·{" "}
                            {format(new Date(o.created_at), "d MMM", { locale: it })}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold tabular-nums">
                            {fmtEur(o.total_amount)}
                          </p>
                          <p className="text-[11px] tabular-nums text-muted-foreground">
                            Pag. {fmtEur(o.paid_amount)}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </PullToRefresh>

      <SalesOrderDetailSheet
        orderId={selectedOrderId}
        open={!!selectedOrderId}
        onOpenChange={(open) => !open && setSelectedOrderId(null)}
      />
      <QuickSaleDialog
        open={quickSaleOpen}
        onOpenChange={setQuickSaleOpen}
        onSuccess={() => void ordersQ.refetch()}
      />
    </>
  );
}

export default MobileSales;
export { MobileSales };
