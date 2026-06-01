import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format, subDays } from "date-fns";
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Bell,
  Database,
  FileSpreadsheet,
  Gauge,
  Headphones,
  Inbox,
  LineChart as LineChartIcon,
  Mic,
  PhoneCall,
  Radio,
  Shield,
  Target,
  TrendingUp,
} from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

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
import { useBrand } from "@/contexts/BrandContext";
import { useChannelPerformance } from "@/hooks/useChannelPerformance";
import { useHasMarketingAccess } from "@/hooks/useMarketingAccess";
import { formatCurrency, formatNumber } from "@/lib/formatKpi";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

type PeriodKey = "7d" | "30d" | "90d";

const PERIOD_OPTIONS: ChipOption<PeriodKey>[] = [
  { value: "7d", label: "7g" },
  { value: "30d", label: "30g" },
  { value: "90d", label: "90g" },
];

const PERIOD_DAYS: Record<PeriodKey, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

interface ModuleLink {
  title: string;
  description: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
}

const MODULES: ModuleLink[] = [
  {
    title: "Marketing Performance",
    description: "Canali, costi, CPL/CAC, A/B compare",
    path: "/marketing/performance",
    icon: BarChart3,
  },
  {
    title: "Wallboard Call Center",
    description: "Operatori live, answer-rate, AHT",
    path: "/callcenter/wallboard",
    icon: Activity,
  },
  {
    title: "Performance Operatori",
    description: "Ranking operatori e storico chiamate",
    path: "/admin/callcenter-kpi",
    icon: Headphones,
  },
  {
    title: "Trascrizioni Call Center",
    description: "Sentiment, esito, intent, obiezioni",
    path: "/callcenter/transcripts",
    icon: Mic,
  },
  {
    title: "Sales Performance Sheet",
    description: "Foglio ESITO appuntamenti per venditore",
    path: "/sales/performance-sheet",
    icon: FileSpreadsheet,
  },
  {
    title: "Vendite & Lifecycle",
    description: "Stati ordine end-to-end",
    path: "/sales",
    icon: TrendingUp,
  },
  {
    title: "Numeri tracciati",
    description: "Anagrafica DID/numeri verdi, attribuzione",
    path: "/admin/tracking-numbers",
    icon: Radio,
  },
  {
    title: "Costi & import CSV",
    description: "Inserimento e import costi multi-formato",
    path: "/marketing/costi",
    icon: Database,
  },
  {
    title: "Alert performance",
    description: "Soglie CPL/answer-rate/% consegne",
    path: "/admin/performance-alerts",
    icon: Bell,
  },
  {
    title: "Retention & DPIA",
    description: "GDPR, cleanup notturno, audio retention",
    path: "/admin/data-retention",
    icon: Shield,
  },
  {
    title: "SLO board",
    description: "Burn-rate e salute servizio",
    path: "/admin/slo-board",
    icon: Gauge,
  },
];

function MobilePerformanceHub() {
  const queryClient = useQueryClient();
  const { hasBrandSelected, isAllBrandsSelected } = useBrand();
  const hasMarketingAccess = useHasMarketingAccess();

  const [period, setPeriod] = useState<PeriodKey>("30d");

  const { from, to } = useMemo(() => {
    const today = new Date();
    return {
      from: format(subDays(today, PERIOD_DAYS[period]), "yyyy-MM-dd"),
      to: format(today, "yyyy-MM-dd"),
    };
  }, [period]);

  const channelsEnabled =
    hasBrandSelected && !isAllBrandsSelected && hasMarketingAccess;

  const {
    data: channels = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useChannelPerformance({ from, to });

  const totals = useMemo(() => {
    return channels.reduce(
      (acc, c) => ({
        leads: acc.leads + (c.leads_count ?? 0),
        spend: acc.spend + (c.spend ?? 0),
        deals: acc.deals + (c.deals_count ?? 0),
        won: acc.won + (c.deals_won ?? 0),
        revenue: acc.revenue + (c.revenue ?? 0),
      }),
      { leads: 0, spend: 0, deals: 0, won: 0, revenue: 0 },
    );
  }, [channels]);

  const topChannels = useMemo(
    () =>
      [...channels]
        .sort((a, b) => (b.leads_count ?? 0) - (a.leads_count ?? 0))
        .slice(0, 5),
    [channels],
  );

  const chartData = useMemo(
    () =>
      topChannels.map((c) => ({
        name: c.channel_name?.length > 10
          ? c.channel_name.slice(0, 10) + "…"
          : c.channel_name || c.channel_type,
        leads: c.leads_count ?? 0,
      })),
    [topChannels],
  );

  const cpl = totals.leads > 0 ? totals.spend / totals.leads : null;

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["channel-performance"] });
  };

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="flex flex-col gap-4 pb-24">
        {/* Header */}
        <header className="sticky top-0 z-20 -mt-3 border-b border-border/40 bg-background/85 px-4 pb-3 pt-3 backdrop-blur">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight">
              Performance
            </h1>
            <p className="truncate text-xs text-muted-foreground">
              Suite completa · funnel lead → consegna
            </p>
          </div>
          {channelsEnabled && (
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
          )}
        </header>

        {/* KPI section */}
        {channelsEnabled ? (
          <section className="space-y-3 px-4" aria-label="KPI marketing">
            {isError ? (
              <ErrorState
                title="Errore caricamento KPI"
                description={error instanceof Error ? error.message : undefined}
                onRetry={() => {
                  void refetch();
                }}
              />
            ) : isLoading ? (
              <MobileListSkeleton count={3} />
            ) : channels.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title="Nessun dato nel periodo"
                description="Prova ad ampliare il periodo o verifica le sorgenti."
              />
            ) : (
              <>
                <HeroMetricCard
                  label="Lead nel periodo"
                  value={formatNumber(totals.leads)}
                  caption={`${channels.length} canali attivi`}
                  variant="primary"
                />
                <KpiList ariaLabel="KPI principali">
                  <MetricRow
                    title="Spesa"
                    value={formatCurrency(totals.spend)}
                    icon={<Target className="h-4 w-4" />}
                  />
                  <MetricRow
                    title="CPL medio"
                    value={cpl != null ? formatCurrency(cpl) : "—"}
                    icon={<LineChartIcon className="h-4 w-4" />}
                  />
                  <MetricRow
                    title="Deal vinti"
                    value={`${formatNumber(totals.won)} / ${formatNumber(totals.deals)}`}
                    icon={<TrendingUp className="h-4 w-4" />}
                    subtitle={
                      totals.deals > 0
                        ? `Win-rate ${((totals.won / totals.deals) * 100).toFixed(0)}%`
                        : undefined
                    }
                  />
                  <MetricRow
                    title="Revenue"
                    value={formatCurrency(totals.revenue)}
                    icon={<PhoneCall className="h-4 w-4" />}
                  />
                </KpiList>

                {/* Mini chart: top 5 canali per lead */}
                <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-card">
                  <div className="mb-3 flex items-baseline justify-between">
                    <h2 className="text-sm font-semibold tracking-tight">
                      Top canali per lead
                    </h2>
                    <span className="text-[11px] text-muted-foreground">
                      Top {chartData.length}
                    </span>
                  </div>
                  <div className="h-40 w-full" aria-hidden>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={chartData}
                        margin={{ top: 4, right: 4, bottom: 0, left: -16 }}
                      >
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                          axisLine={false}
                          tickLine={false}
                          interval={0}
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                          axisLine={false}
                          tickLine={false}
                          width={28}
                        />
                        <Tooltip
                          cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
                          contentStyle={{
                            background: "hsl(var(--popover))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: 12,
                            fontSize: 12,
                          }}
                        />
                        <Bar dataKey="leads" radius={[6, 6, 0, 0]}>
                          {chartData.map((_, i) => (
                            <Cell key={i} fill="hsl(var(--primary))" />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Top-N lista canali */}
                <ul className="flex flex-col gap-2" aria-label="Top canali">
                  {topChannels.map((c) => (
                    <li key={c.channel_id}>
                      <div className="rounded-xl border border-border/60 bg-card p-3 shadow-card">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">
                              {c.channel_name || c.channel_type}
                            </p>
                            <p className="truncate text-[11px] text-muted-foreground">
                              {c.category} · {c.channel_type}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold tabular-nums">
                              {formatNumber(c.leads_count)}
                            </p>
                            <p className="text-[11px] tabular-nums text-muted-foreground">
                              {c.cpl != null ? formatCurrency(c.cpl) : "—"} CPL
                            </p>
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        ) : (
          <section className="px-4">
            <EmptyState
              icon={BarChart3}
              title={
                !hasBrandSelected
                  ? "Nessun brand selezionato"
                  : isAllBrandsSelected
                    ? "Seleziona un singolo brand"
                    : "Accesso KPI riservato"
              }
              description={
                !hasBrandSelected
                  ? "Seleziona un brand dalla sidebar per vedere i KPI."
                  : isAllBrandsSelected
                    ? "I KPI sono visibili per singolo brand."
                    : "I KPI marketing sono riservati ad admin, CEO e amministrazione."
              }
            />
          </section>
        )}

        {/* Esplora moduli */}
        <section className="px-4" aria-label="Esplora moduli">
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Esplora moduli
          </h2>
          <ul className="flex flex-col gap-2">
            {MODULES.map((m) => {
              const Icon = m.icon;
              return (
                <li key={m.path}>
                  <Link
                    to={m.path}
                    className={cn(
                      "press-scale flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-3 shadow-card",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    )}
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{m.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {m.description}
                      </p>
                    </div>
                    <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </PullToRefresh>
  );
}

export default MobilePerformanceHub;
export { MobilePerformanceHub };
