import { useNavigate } from 'react-router-dom';
import {
  Kanban,
  TrendingUp,
  Target,
  AlertTriangle,
  Timer,
  Users,
  ChevronRight,
  AlertCircle,
  Trophy,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useBrand } from '@/contexts/BrandContext';
import { useDeals, usePipelineStages } from '@/hooks/usePipeline';
import { useSalespersonKpis } from '@/hooks/useSalespersonKpis';
import { useBrandDealScores } from '@/hooks/useDealScoring';
import { useRevenueForecast } from '@/hooks/useForecast';
import { formatCurrency } from '@/lib/formatKpi';
import { cn } from '@/lib/utils';

import { SectionLabel } from '@/components/mobile/SectionLabel';
import { HeroMetricCard } from '@/components/mobile/HeroMetricCard';
import { MetricRow, KpiList } from '@/components/mobile/MetricRow';
import {
  HeroMetricSkeleton,
  KpiListSkeleton,
  ListItemSkeleton,
} from '@/components/mobile/MobileSkeletons';
import { PullToRefresh } from '@/components/mobile/PullToRefresh';
import { EmptyState } from '@/components/mobile/EmptyState';

/**
 * Mobile Dashboard Responsabile Venditori (SPEC §6.1, task F3.3).
 *
 * Riusa esattamente gli stessi hook/queryKeys del desktop `SalesManagerDashboard`
 * (`useDeals`, `usePipelineStages`, `useSalespersonKpis`, `useBrandDealScores`,
 * `useRevenueForecast`) → react-query deduplica le richieste, nessun fetch extra,
 * nessuna modifica a RPC/RLS/backend.
 *
 * Composizione mobile:
 *  - Hero: valore pipeline aperta + caption forecast (drill → /pipeline)
 *  - KpiList: deal aperti, vinti, win rate medio, deal a rischio, stallo, follow
 *  - Funnel pipeline compatto (barre orizzontali per stage)
 *  - Top venditori (lista) → /team/salespersons
 *  - Deal in stallo (lista compatta) → /pipeline
 */
export function MobileSalesManagerDashboard() {
  const navigate = useNavigate();
  const { hasBrandSelected } = useBrand();

  const { data: openDeals, isLoading: dealsLoading } = useDeals('open');
  const { data: wonDeals, isLoading: wonLoading } = useDeals('won');
  const { data: stages } = usePipelineStages();
  const { data: salespersons, isLoading: spLoading } = useSalespersonKpis();
  const { data: riskCounts, isLoading: riskLoading } = useBrandDealScores();
  const { data: forecast, isLoading: forecastLoading } = useRevenueForecast('month');

  if (!hasBrandSelected) {
    return (
      <div className="p-4">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Seleziona un brand dal menu per accedere alla dashboard.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const openCount = openDeals?.length ?? 0;
  const wonCount = wonDeals?.length ?? 0;
  const winRate = salespersons && salespersons.length > 0
    ? salespersons.reduce((sum, s) => sum + s.win_rate, 0) / salespersons.length
    : 0;
  const pipelineValue = (openDeals ?? []).reduce((sum, d) => sum + (d.value ?? 0), 0);

  const stalledDays = 14;
  const stalledDeals = (openDeals ?? []).filter((d) => {
    const diff = (Date.now() - new Date(d.updated_at).getTime()) / (1000 * 60 * 60 * 24);
    return diff >= stalledDays;
  });

  const atRiskCount = (riskCounts?.high ?? 0) + (riskCounts?.critical ?? 0);

  const funnelMax = Math.max(
    1,
    ...(stages ?? []).map((s) => (openDeals ?? []).filter((d) => d.current_stage_id === s.id).length),
  );

  const topSalespersons = [...(salespersons ?? [])]
    .sort((a, b) => b.total_value_won - a.total_value_won)
    .slice(0, 5);

  const isHeroLoading = dealsLoading || forecastLoading;
  const isKpiLoading = dealsLoading || wonLoading || spLoading || riskLoading;

  const winRateTone =
    winRate >= 30 ? 'positive' : winRate >= 15 ? 'neutral' : winRate > 0 ? 'warning' : 'neutral';
  const atRiskTone = atRiskCount > 0 ? 'negative' : 'neutral';
  const stalledTone = stalledDeals.length > 0 ? 'warning' : 'neutral';

  return (
    <PullToRefresh
      className="pb-10"
      invalidateKeys={[
        ['deals'],
        ['salesperson-kpis'],
        ['brand-deal-scores'],
        ['revenue-forecast'],
      ]}
    >
      {/* Sticky compact header */}
      <header
        className={cn(
          'sticky top-0 z-30 px-4 pt-3 pb-3',
          'bg-background/85 backdrop-blur-xl',
          'border-b border-border/40',
        )}
      >
        <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-semibold">
          Responsabile Venditori
        </p>
        <h1 className="text-[17px] font-semibold tracking-tight truncate">
          Pipeline, performance e rischio
        </h1>
      </header>

      <div className="px-4 pt-5 space-y-5">
        {/* Hero: valore pipeline aperta + forecast */}
        {isHeroLoading ? (
          <HeroMetricSkeleton />
        ) : (
          <button
            type="button"
            onClick={() => navigate('/pipeline')}
            aria-label="Apri pipeline: valore complessivo deal aperti"
            className="press-scale w-full text-left rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <HeroMetricCard
              label="Pipeline aperta"
              value={formatCurrency(pipelineValue)}
              variant="primary"
              caption={
                forecast
                  ? `Forecast mese ${formatCurrency(forecast.predicted_revenue)} · conf. ${(forecast.confidence * 100).toFixed(0)}%`
                  : `${openCount} deal aperti · Tocca per la pipeline`
              }
            />
          </button>
        )}

        {/* KPI list */}
        <section>
          <SectionLabel>Indicatori chiave</SectionLabel>
          {isKpiLoading ? (
            <KpiListSkeleton count={6} />
          ) : (
            <KpiList>
              <MetricRow
                icon={<Kanban className="h-4 w-4" aria-hidden="true" />}
                title="Deal aperti"
                value={String(openCount)}
                subtitle={`${wonCount} vinti complessivi`}
                onClick={() => navigate('/pipeline')}
                ariaLabel="Apri pipeline"
              />
              <MetricRow
                icon={<TrendingUp className="h-4 w-4" aria-hidden="true" />}
                title="Pipeline (valore)"
                value={formatCurrency(pipelineValue)}
                subtitle="Totale deal aperti"
                onClick={() => navigate('/pipeline')}
                ariaLabel="Apri pipeline"
              />
              <MetricRow
                icon={<Target className="h-4 w-4" aria-hidden="true" />}
                title="Win rate medio"
                value={`${winRate.toFixed(0)}%`}
                subtitle={`${salespersons?.length ?? 0} venditori`}
                tone={winRateTone}
                onClick={() => navigate('/team/salespersons')}
                ariaLabel="Apri performance venditori"
              />
              <MetricRow
                icon={<AlertTriangle className="h-4 w-4" aria-hidden="true" />}
                title="Deal a rischio"
                value={String(atRiskCount)}
                subtitle="Score alto / critico"
                tone={atRiskTone}
                invertTrend
                onClick={() => navigate('/pipeline')}
                ariaLabel="Apri pipeline filtrata sul rischio"
              />
              <MetricRow
                icon={<Timer className="h-4 w-4" aria-hidden="true" />}
                title="Deal in stallo"
                value={String(stalledDeals.length)}
                subtitle={`Fermi da oltre ${stalledDays} giorni`}
                tone={stalledTone}
                invertTrend
                onClick={() => navigate('/pipeline')}
                ariaLabel="Apri pipeline"
              />
              <MetricRow
                icon={<Trophy className="h-4 w-4" aria-hidden="true" />}
                title="Vendite vinte"
                value={String(wonCount)}
                subtitle="Totale deal chiusi vinti"
                tone={wonCount > 0 ? 'positive' : 'neutral'}
              />
            </KpiList>
          )}
        </section>

        {/* Funnel pipeline compatto */}
        <section>
          <SectionLabel
            trailing={
              <button
                type="button"
                onClick={() => navigate('/pipeline')}
                className="press-scale inline-flex items-center gap-0.5 text-[11px] font-semibold text-primary"
                aria-label="Apri la pipeline completa"
              >
                Apri
                <ChevronRight className="h-3 w-3" aria-hidden="true" />
              </button>
            }
          >
            Funnel pipeline
          </SectionLabel>
          {dealsLoading || !stages ? (
            <div className="space-y-2.5">
              <ListItemSkeleton />
              <ListItemSkeleton />
              <ListItemSkeleton />
            </div>
          ) : stages.length === 0 ? (
            <EmptyState
              icon={Kanban}
              title="Nessuno stage configurato"
              description="Configura le fasi della pipeline per visualizzare il funnel."
            />
          ) : (
            <ul
              className="space-y-2 rounded-2xl border border-border/60 bg-card p-3 shadow-card"
              role="list"
              aria-label="Distribuzione deal per stage"
            >
              {stages.map((stage) => {
                const count = (openDeals ?? []).filter((d) => d.current_stage_id === stage.id).length;
                const widthPct = Math.max(8, (count / funnelMax) * 100);
                return (
                  <li key={stage.id} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 truncate text-[11px] font-medium text-muted-foreground">
                      {stage.name}
                    </span>
                    <div
                      className="relative h-6 flex-1 overflow-hidden rounded-md bg-muted"
                      role="progressbar"
                      aria-valuenow={count}
                      aria-valuemin={0}
                      aria-valuemax={funnelMax}
                      aria-label={`${stage.name}: ${count} deal`}
                    >
                      <div
                        className="flex h-full items-center justify-end rounded-md px-2 text-[11px] font-semibold tabular-nums text-primary-foreground"
                        style={{
                          width: `${widthPct}%`,
                          backgroundColor: stage.color || 'hsl(var(--primary))',
                        }}
                      >
                        {count}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Top venditori */}
        <section>
          <SectionLabel
            trailing={
              <button
                type="button"
                onClick={() => navigate('/team/salespersons')}
                className="press-scale inline-flex items-center gap-0.5 text-[11px] font-semibold text-primary"
                aria-label="Apri la classifica completa dei venditori"
              >
                Apri
                <ChevronRight className="h-3 w-3" aria-hidden="true" />
              </button>
            }
          >
            Top venditori
          </SectionLabel>
          {spLoading ? (
            <div className="space-y-2.5">
              <ListItemSkeleton />
              <ListItemSkeleton />
              <ListItemSkeleton />
            </div>
          ) : topSalespersons.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Nessun venditore"
              description="Quando i venditori inizieranno a chiudere deal, appariranno qui."
            />
          ) : (
            <ul className="space-y-2" role="list" aria-label="Classifica venditori per valore vinto">
              {topSalespersons.map((sp, idx) => {
                const name = sp.full_name || sp.email;
                const winRateOk = sp.win_rate >= 30;
                return (
                  <li key={sp.user_id}>
                    <button
                      type="button"
                      onClick={() => navigate('/team/salespersons')}
                      aria-label={`${name}: ${formatCurrency(sp.total_value_won)} vinto, ${sp.win_rate.toFixed(0)}% win rate`}
                      className="press-scale w-full rounded-2xl border border-border/60 bg-card p-3 text-left shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-[12px] font-semibold tabular-nums text-muted-foreground">
                          #{idx + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{name}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {sp.deals_open} aperti · {sp.deals_won} vinti
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-semibold tabular-nums">
                            {formatCurrency(sp.total_value_won)}
                          </p>
                          <p
                            className={cn(
                              'text-[11px] font-semibold tabular-nums',
                              winRateOk ? 'text-success' : 'text-warning',
                            )}
                          >
                            {sp.win_rate.toFixed(0)}% win
                          </p>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Deal in stallo */}
        <section>
          <SectionLabel
            trailing={
              <button
                type="button"
                onClick={() => navigate('/pipeline')}
                className="press-scale inline-flex items-center gap-0.5 text-[11px] font-semibold text-primary"
                aria-label="Apri la pipeline completa"
              >
                Apri
                <ChevronRight className="h-3 w-3" aria-hidden="true" />
              </button>
            }
          >
            Deal in stallo
          </SectionLabel>
          {dealsLoading ? (
            <div className="space-y-2.5">
              <ListItemSkeleton />
              <ListItemSkeleton />
            </div>
          ) : stalledDeals.length === 0 ? (
            <EmptyState
              icon={Timer}
              title="Nessun deal in stallo"
              description={`Tutti i deal aperti sono stati aggiornati negli ultimi ${stalledDays} giorni.`}
            />
          ) : (
            <ul className="space-y-2" role="list" aria-label="Deal fermi da oltre due settimane">
              {stalledDeals.slice(0, 5).map((deal) => {
                const days = Math.floor(
                  (Date.now() - new Date(deal.updated_at).getTime()) / (1000 * 60 * 60 * 24),
                );
                const contact = deal.contact as
                  | { first_name?: string | null; last_name?: string | null }
                  | null
                  | undefined;
                const contactName =
                  [contact?.first_name, contact?.last_name].filter(Boolean).join(' ') || 'Contatto';
                return (
                  <li key={deal.id}>
                    <button
                      type="button"
                      onClick={() => navigate('/pipeline')}
                      aria-label={`Apri pipeline su ${contactName}: fermo da ${days} giorni`}
                      className="press-scale w-full rounded-2xl border border-border/60 bg-card p-3 text-left shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{contactName}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                            {deal.value ? formatCurrency(deal.value) : 'Nessun valore'}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-danger/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-danger">
                          {days}gg
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </PullToRefresh>
  );
}
