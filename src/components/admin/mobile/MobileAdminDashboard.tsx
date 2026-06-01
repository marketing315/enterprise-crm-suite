import { useNavigate } from 'react-router-dom';
import {
  Shield,
  Users,
  Webhook,
  Ticket,
  AlertCircle,
  Kanban,
  TrendingUp,
  Target,
  Gauge,
  ScrollText,
  ChevronRight,
  Calendar,
  Activity,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useDashboardData } from '@/hooks/useDashboardData';
import { useWebhookMetrics24h } from '@/hooks/useWebhookMetrics';
import { useBrand } from '@/contexts/BrandContext';
import { cn } from '@/lib/utils';

import { SectionLabel } from '@/components/mobile/SectionLabel';
import { HeroMetricCard } from '@/components/mobile/HeroMetricCard';
import { MetricRow, KpiList } from '@/components/mobile/MetricRow';
import {
  HeroMetricSkeleton,
  KpiListSkeleton,
} from '@/components/mobile/MobileSkeletons';
import { PullToRefresh } from '@/components/mobile/PullToRefresh';

/**
 * Mobile Dashboard Admin / Amministrazione (SPEC §6.1, task F3.5).
 *
 * Riusa esattamente gli stessi hook/queryKeys del desktop `AdminDashboard`
 * (`useDashboardData`, `useWebhookMetrics24h`) → cache react-query condivisa,
 * zero fetch extra, nessuna modifica a RPC/RLS.
 *
 * Composizione mobile:
 *  - Hero: ticket aperti (variant negative se SLA breach, warning se backlog alto)
 *  - Banner alert per SLA breach / webhook KO
 *  - KpiList: contatti, lead 7gg, deal aperti, webhook 24h, appuntamenti oggi
 *  - Azioni rapide come lista (webhook, ticket, team, AI, SLO, runbook, settings)
 */
export function MobileAdminDashboard() {
  const navigate = useNavigate();
  const { hasBrandSelected } = useBrand();

  const {
    leadsToday,
    leadsWeek,
    openDeals,
    openTickets,
    slaBreachedTickets,
    totalContacts,
    appointmentsToday,
    isLoading,
  } = useDashboardData();

  const { data: webhookMetrics, isLoading: webhookLoading } = useWebhookMetrics24h();

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

  const webhookOk = webhookMetrics?.success_count ?? 0;
  const webhookKo = webhookMetrics?.failed_count ?? 0;
  const webhookTotal = webhookMetrics?.total_deliveries ?? 0;
  const webhookFailRate = webhookTotal > 0 ? (webhookKo / webhookTotal) * 100 : 0;

  const heroVariant: 'primary' | 'negative' | 'positive' =
    slaBreachedTickets > 0 ? 'negative' : openTickets > 20 ? 'primary' : 'positive';
  const ticketTone =
    slaBreachedTickets > 0
      ? 'negative'
      : openTickets > 20
        ? 'warning'
        : openTickets > 0
          ? 'neutral'
          : 'positive';
  const webhookTone =
    webhookFailRate > 5 ? 'negative' : webhookFailRate > 1 ? 'warning' : webhookTotal > 0 ? 'positive' : 'neutral';

  const isHeroLoading = isLoading;
  const isKpiLoading = isLoading || webhookLoading;

  type QuickAction = {
    label: string;
    icon: typeof Webhook;
    path: string;
    badge?: { text: string; tone: 'danger' | 'warning' };
  };
  const quickActions: QuickAction[] = [
    {
      label: 'Webhook Monitor',
      icon: Webhook,
      path: '/admin/webhooks',
      ...(webhookKo > 0
        ? { badge: { text: `${webhookKo} KO`, tone: 'warning' as const } }
        : {}),
    },
    {
      label: 'Gestione Ticket',
      icon: Ticket,
      path: '/tickets',
      ...(slaBreachedTickets > 0
        ? { badge: { text: `${slaBreachedTickets} SLA`, tone: 'danger' as const } }
        : {}),
    },
    { label: 'Team & Ruoli', icon: Users, path: '/team' },
    { label: 'AI Performance', icon: TrendingUp, path: '/admin/ai' },
    { label: 'SLO Board', icon: Target, path: '/admin/slo-board' },
    { label: 'Slow Queries', icon: Gauge, path: '/admin/slow-queries' },
    { label: 'Changelog & Runbook', icon: ScrollText, path: '/admin/changelog' },
    { label: 'Impostazioni', icon: AlertCircle, path: '/settings' },
  ];

  return (
    <PullToRefresh
      className="pb-10"
      invalidateKeys={[
        ['dashboard-leads-today'],
        ['dashboard-leads-week'],
        ['dashboard-open-deals'],
        ['dashboard-open-tickets'],
        ['dashboard-sla-breached'],
        ['dashboard-total-contacts'],
        ['dashboard-appointments-today'],
        ['webhook-metrics-24h'],
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
          Amministrazione
        </p>
        <h1 className="text-[17px] font-semibold tracking-tight truncate">
          Salute piattaforma
        </h1>
      </header>

      <div className="px-4 pt-5 space-y-5">
        {/* Hero: ticket aperti */}
        {isHeroLoading ? (
          <HeroMetricSkeleton />
        ) : (
          <button
            type="button"
            onClick={() => navigate('/tickets')}
            aria-label={`Apri ticket: ${openTickets} aperti, ${slaBreachedTickets} SLA breach`}
            className="press-scale w-full text-left rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <HeroMetricCard
              label="Ticket aperti"
              value={String(openTickets)}
              variant={heroVariant}
              caption={
                slaBreachedTickets > 0
                  ? `${slaBreachedTickets} in SLA breach`
                  : 'Nessun breach attivo'
              }
            />
          </button>
        )}

        {/* Alert banner — solo se ci sono problemi */}
        {!isKpiLoading && (slaBreachedTickets > 0 || webhookKo > 0) && (
          <Alert variant="destructive" className="border-danger/40 bg-danger/10">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-sm">
              {slaBreachedTickets > 0 && (
                <div>
                  <strong>{slaBreachedTickets}</strong> ticket in SLA breach.
                </div>
              )}
              {webhookKo > 0 && (
                <div>
                  <strong>{webhookKo}</strong> webhook falliti nelle ultime 24h
                  {webhookFailRate > 0 ? ` (${webhookFailRate.toFixed(1)}%)` : ''}.
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* KPI list */}
        <section>
          <SectionLabel>Indicatori chiave</SectionLabel>
          {isKpiLoading ? (
            <KpiListSkeleton count={6} />
          ) : (
            <KpiList>
              <MetricRow
                icon={<Users className="h-4 w-4" aria-hidden="true" />}
                title="Contatti totali"
                value={String(totalContacts)}
                subtitle={`${leadsToday} lead oggi · ${leadsWeek} ultimi 7gg`}
                onClick={() => navigate('/contacts')}
                ariaLabel="Apri contatti"
              />
              <MetricRow
                icon={<Activity className="h-4 w-4" aria-hidden="true" />}
                title="Lead 7 giorni"
                value={String(leadsWeek)}
                subtitle={`${leadsToday} oggi`}
                tone={leadsWeek > 0 ? 'positive' : 'neutral'}
                onClick={() => navigate('/contacts')}
                ariaLabel="Apri contatti"
              />
              <MetricRow
                icon={<Kanban className="h-4 w-4" aria-hidden="true" />}
                title="Deal aperti"
                value={String(openDeals)}
                subtitle="Pipeline attiva"
                onClick={() => navigate('/pipeline')}
                ariaLabel="Apri pipeline"
              />
              <MetricRow
                icon={<Ticket className="h-4 w-4" aria-hidden="true" />}
                title="Ticket aperti"
                value={String(openTickets)}
                subtitle={
                  slaBreachedTickets > 0
                    ? `${slaBreachedTickets} SLA breach`
                    : 'Nessun breach'
                }
                tone={ticketTone}
                invertTrend
                onClick={() => navigate('/tickets')}
                ariaLabel="Apri ticket"
              />
              <MetricRow
                icon={<Webhook className="h-4 w-4" aria-hidden="true" />}
                title="Webhook 24h"
                value={String(webhookTotal)}
                subtitle={`✓ ${webhookOk} · ✗ ${webhookKo}`}
                tone={webhookTone}
                invertTrend
                onClick={() => navigate('/admin/webhooks')}
                ariaLabel="Apri webhook monitor"
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

        {/* Azioni rapide */}
        <section>
          <SectionLabel>Azioni rapide</SectionLabel>
          <ul className="space-y-2" role="list" aria-label="Azioni rapide amministrazione">
            {quickActions.map((a) => {
              const Icon = a.icon;
              return (
                <li key={a.path}>
                  <button
                    type="button"
                    onClick={() => navigate(a.path)}
                    aria-label={a.label}
                    className="press-scale w-full rounded-2xl border border-border/60 bg-card p-3 text-left shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{a.label}</p>
                      </div>
                      {a.badge && (
                        <span
                          className={cn(
                            'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums',
                            a.badge.tone === 'danger'
                              ? 'bg-danger/10 text-danger'
                              : 'bg-warning/10 text-warning',
                          )}
                        >
                          {a.badge.text}
                        </span>
                      )}
                      <ChevronRight
                        className="h-4 w-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <div className="pt-2 pb-4 text-center">
          <Shield className="mx-auto h-4 w-4 text-muted-foreground/40" aria-hidden="true" />
        </div>
      </div>
    </PullToRefresh>
  );
}
