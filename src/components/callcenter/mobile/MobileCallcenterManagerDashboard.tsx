import { useMemo } from 'react';
import { subDays, startOfDay, endOfDay } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import {
  Phone,
  PhoneCall,
  Calendar,
  Clock,
  Users,
  ChevronRight,
  AlertCircle,
  Timer,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useBrand } from '@/contexts/BrandContext';
import {
  useCallcenterKpisOverview,
  useCallcenterKpisByOperator,
} from '@/hooks/useCallcenterKpis';
import { useDashboardData } from '@/hooks/useDashboardData';
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
 * Mobile Dashboard Responsabile Call Center (SPEC §6.1, task F3.4).
 *
 * Riusa esattamente gli stessi hook/queryKeys del desktop
 * (`useCallcenterKpisOverview`, `useCallcenterKpisByOperator`, `useDashboardData`),
 * → cache react-query condivisa, nessun fetch extra, nessuna modifica a RPC/RLS.
 *
 * Composizione mobile:
 *  - Hero: backlog ticket attuale con caption "non assegnati"
 *  - KpiList: ticket creati/risolti, backlog, appuntamenti, tempo medio risolvere/assegnare
 *  - Leaderboard operatori (top 5 per risolti) → /admin/callcenter-kpi
 */
export function MobileCallcenterManagerDashboard() {
  const navigate = useNavigate();
  const { hasBrandSelected } = useBrand();

  const now = new Date();
  const from = useMemo(() => startOfDay(subDays(now, 7)), []);
  const to = useMemo(() => endOfDay(now), []);

  const { data: overview, isLoading: overviewLoading } =
    useCallcenterKpisOverview(from, to);
  const { data: operators, isLoading: operatorsLoading } =
    useCallcenterKpisByOperator(from, to);
  const { appointmentsToday, isLoading: dashLoading } = useDashboardData();

  if (!hasBrandSelected) {
    return (
      <div className="p-4">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Seleziona un brand dal menu per accedere alla dashboard.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const backlog = overview?.backlog_total ?? 0;
  const unassigned = overview?.unassigned_now ?? 0;
  const created = overview?.tickets_created ?? 0;
  const resolved = overview?.tickets_resolved ?? 0;
  const closed = overview?.tickets_closed ?? 0;
  const assigned = overview?.tickets_assigned ?? 0;
  const avgAssignMin = overview?.avg_time_to_assign_minutes ?? 0;
  const avgResolveMin = overview?.avg_time_to_resolve_minutes ?? 0;

  const formatDuration = (min: number) => {
    if (!min || min <= 0) return '—';
    if (min < 60) return `${Math.round(min)} min`;
    return `${(min / 60).toFixed(1)} h`;
  };

  const isHeroLoading = overviewLoading;
  const isKpiLoading = overviewLoading || dashLoading;

  const backlogTone =
    backlog > 20 ? 'negative' : backlog > 10 ? 'warning' : backlog > 0 ? 'neutral' : 'positive';
  const unassignedTone =
    unassigned > 10 ? 'negative' : unassigned > 0 ? 'warning' : 'positive';
  const assignTone =
    avgAssignMin > 60 ? 'negative' : avgAssignMin > 15 ? 'warning' : avgAssignMin > 0 ? 'positive' : 'neutral';
  const resolveTone =
    avgResolveMin > 240 ? 'negative' : avgResolveMin > 60 ? 'warning' : avgResolveMin > 0 ? 'positive' : 'neutral';

  const topOperators = [...(operators ?? [])]
    .sort((a, b) => b.tickets_resolved - a.tickets_resolved)
    .slice(0, 5);

  return (
    <PullToRefresh
      className="pb-10"
      invalidateKeys={[
        ['callcenter-kpis-overview'],
        ['callcenter-kpis-by-operator'],
        ['dashboard-appointments-today'],
      ]}
    >
      <header
        className={cn(
          'sticky top-0 z-30 px-4 pt-3 pb-3',
          'bg-background/85 backdrop-blur-xl',
          'border-b border-border/40',
        )}
      >
        <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-semibold">
          Responsabile Call Center
        </p>
        <h1 className="text-[17px] font-semibold tracking-tight truncate">
          Team, SLA e produttività
        </h1>
      </header>

      <div className="px-4 pt-5 space-y-5">
        {/* Hero: backlog attuale */}
        {isHeroLoading ? (
          <HeroMetricSkeleton />
        ) : (
          <button
            type="button"
            onClick={() => navigate('/tickets')}
            aria-label="Apri ticket: backlog corrente"
            className="press-scale w-full text-left rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <HeroMetricCard
              label="Backlog ticket"
              value={String(backlog)}
              variant={backlog > 20 ? 'danger' : 'primary'}
              caption={`${unassigned} non assegnati · Ultimi 7 giorni`}
            />
          </button>
        )}

        {/* KPI list */}
        <section>
          <SectionLabel>Indicatori chiave (7 giorni)</SectionLabel>
          {isKpiLoading ? (
            <KpiListSkeleton count={6} />
          ) : (
            <KpiList>
              <MetricRow
                icon={<Phone className="h-4 w-4" aria-hidden="true" />}
                title="Ticket creati"
                value={String(created)}
                subtitle={`${assigned} assegnati`}
                onClick={() => navigate('/tickets')}
                ariaLabel="Apri ticket"
              />
              <MetricRow
                icon={<PhoneCall className="h-4 w-4" aria-hidden="true" />}
                title="Ticket risolti"
                value={String(resolved)}
                subtitle={`${closed} chiusi`}
                tone={resolved > 0 ? 'positive' : 'neutral'}
                onClick={() => navigate('/tickets')}
                ariaLabel="Apri ticket"
              />
              <MetricRow
                icon={<Clock className="h-4 w-4" aria-hidden="true" />}
                title="Backlog corrente"
                value={String(backlog)}
                subtitle={`${unassigned} non assegnati`}
                tone={backlogTone}
                invertTrend
                onClick={() => navigate('/tickets')}
                ariaLabel="Apri ticket"
              />
              <MetricRow
                icon={<AlertCircle className="h-4 w-4" aria-hidden="true" />}
                title="Non assegnati"
                value={String(unassigned)}
                subtitle="Da prendere in carico"
                tone={unassignedTone}
                invertTrend
                onClick={() => navigate('/tickets')}
                ariaLabel="Apri ticket non assegnati"
              />
              <MetricRow
                icon={<Timer className="h-4 w-4" aria-hidden="true" />}
                title="Tempo medio assegnazione"
                value={formatDuration(avgAssignMin)}
                subtitle="Da creazione a presa in carico"
                tone={assignTone}
                invertTrend
              />
              <MetricRow
                icon={<Timer className="h-4 w-4" aria-hidden="true" />}
                title="Tempo medio risoluzione"
                value={formatDuration(avgResolveMin)}
                subtitle="Da apertura a risoluzione"
                tone={resolveTone}
                invertTrend
              />
              <MetricRow
                icon={<Calendar className="h-4 w-4" aria-hidden="true" />}
                title="Appuntamenti oggi"
                value={String(appointmentsToday)}
                subtitle="Programmati"
                onClick={() => navigate('/appointments/calendar')}
                ariaLabel="Apri calendario"
              />
            </KpiList>
          )}
        </section>

        {/* Leaderboard operatori */}
        <section>
          <SectionLabel
            trailing={
              <button
                type="button"
                onClick={() => navigate('/admin/callcenter-kpi')}
                className="press-scale inline-flex items-center gap-0.5 text-[11px] font-semibold text-primary"
                aria-label="Apri la leaderboard completa"
              >
                Apri
                <ChevronRight className="h-3 w-3" aria-hidden="true" />
              </button>
            }
          >
            Top operatori (7 giorni)
          </SectionLabel>
          {operatorsLoading ? (
            <div className="space-y-2.5">
              <ListItemSkeleton />
              <ListItemSkeleton />
              <ListItemSkeleton />
            </div>
          ) : topOperators.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Nessun operatore"
              description="Non ci sono dati operatore negli ultimi 7 giorni."
            />
          ) : (
            <ul className="space-y-2" role="list" aria-label="Classifica operatori per ticket risolti">
              {topOperators.map((op, idx) => {
                const name = op.full_name || op.email;
                const overloaded = op.backlog_current > 5;
                return (
                  <li key={op.user_id}>
                    <button
                      type="button"
                      onClick={() => navigate('/admin/callcenter-kpi')}
                      aria-label={`${name}: ${op.tickets_resolved} risolti, ${op.backlog_current} in backlog`}
                      className="press-scale w-full rounded-2xl border border-border/60 bg-card p-3 text-left shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-[12px] font-semibold tabular-nums text-muted-foreground">
                          #{idx + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{name}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                            {op.tickets_assigned} assegnati ·{' '}
                            {formatDuration(op.avg_time_to_resolve_minutes)}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-semibold tabular-nums">
                            {op.tickets_resolved}
                          </p>
                          <p
                            className={cn(
                              'text-[11px] font-semibold tabular-nums',
                              overloaded ? 'text-danger' : 'text-muted-foreground',
                            )}
                          >
                            backlog {op.backlog_current}
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
      </div>
    </PullToRefresh>
  );
}
