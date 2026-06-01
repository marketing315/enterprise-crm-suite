// AdminDashboard — v2
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { Shield, Users, Webhook, Ticket, AlertCircle, Kanban, TrendingUp, Target, Gauge, ScrollText } from 'lucide-react';
import { DashboardKpiGrid, KpiItem } from '@/components/dashboard/DashboardKpiGrid';
import { DashboardTrendChart } from '@/components/dashboard/DashboardTrendChart';
import { DashboardSystemStatus } from '@/components/dashboard/DashboardSystemStatus';
import { WebhookDeliveriesCompact } from '@/components/admin/WebhookDeliveriesCompact';
import { useDashboardData } from '@/hooks/useDashboardData';
import { useWebhookMetrics24h } from '@/hooks/useWebhookMetrics';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { useIsMobile } from '@/hooks/use-mobile';
import { MobileAdminDashboard } from '@/components/admin/mobile/MobileAdminDashboard';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const {
    leadsToday,
    leadsWeek,
    openDeals,
    openTickets,
    slaBreachedTickets,
    totalContacts,
    trendData,
    isLoading,
    isTrendLoading,
  } = useDashboardData();

  const { data: webhookMetrics, isLoading: webhookLoading } = useWebhookMetrics24h();

  const webhookOk = webhookMetrics?.success_count ?? 0;
  const webhookKo = webhookMetrics?.failed_count ?? 0;
  const webhookTotal = webhookMetrics?.total_deliveries ?? 0;

  const kpis: KpiItem[] = [
    {
      title: 'Contatti totali',
      value: totalContacts,
      subtitle: `${leadsToday} lead oggi · ${leadsWeek} ultimi 7gg`,
      icon: Users,
      variant: 'default',
    },
    {
      title: 'Webhook (24h)',
      value: webhookTotal,
      subtitle: `✓ ${webhookOk} OK · ✗ ${webhookKo} KO`,
      icon: Webhook,
      variant: webhookKo > 0 ? 'warning' : 'default',
    },
    {
      title: 'Ticket aperti',
      value: openTickets,
      subtitle: `${slaBreachedTickets} SLA breach`,
      icon: Ticket,
      variant: slaBreachedTickets > 0 ? 'destructive' : openTickets > 10 ? 'warning' : 'default',
    },
    {
      title: 'Deal aperti',
      value: openDeals,
      subtitle: 'Pipeline attiva',
      icon: Kanban,
      variant: 'default',
    },
  ];

  return (
    <DashboardShell
      title="Admin Dashboard"
      subtitle="Salute piattaforma e controllo operativo globale"
      icon={<Shield className="h-6 w-6 text-primary" />}
      queryKeys={[
        ['dashboard-leads-today'],
        ['dashboard-open-deals'],
        ['dashboard-open-tickets'],
        ['dashboard-sla-breached'],
        ['dashboard-total-contacts'],
        ['dashboard-trend'],
        ['webhook-metrics-24h'],
      ]}
    >
      {/* KPI Cards */}
      <DashboardKpiGrid items={kpis} isLoading={isLoading || webhookLoading} />

      {/* Charts row */}
      <div className="grid gap-4 md:grid-cols-2">
        <ErrorBoundary compact label="Trend Chart">
          <DashboardTrendChart data={trendData} isLoading={isTrendLoading} />
        </ErrorBoundary>
        <ErrorBoundary compact label="Stato Sistema">
          <DashboardSystemStatus />
        </ErrorBoundary>
      </div>

      {/* Webhook Monitor + Quick Actions */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ErrorBoundary compact label="Webhook Monitor">
            <WebhookDeliveriesCompact />
          </ErrorBoundary>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Azioni rapide</CardTitle>
            <CardDescription>Gestione operativa</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => navigate('/admin/webhooks')}
            >
              <Webhook className="h-4 w-4" />
              Webhook Monitor completo
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => navigate('/tickets')}
            >
              <Ticket className="h-4 w-4" />
              Gestisci Ticket
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => navigate('/team')}
            >
              <Users className="h-4 w-4" />
              Gestione Team / Ruoli
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => navigate('/admin/ai')}
            >
              <TrendingUp className="h-4 w-4" />
              AI Performance
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => navigate('/admin/slo-board')}
            >
              <Target className="h-4 w-4" />
              SLO Board
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => navigate('/admin/slow-queries')}
            >
              <Gauge className="h-4 w-4" />
              Slow Queries
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => navigate('/admin/changelog')}
            >
              <ScrollText className="h-4 w-4" />
              Changelog & Runbook
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => navigate('/settings')}
            >
              <AlertCircle className="h-4 w-4" />
              Impostazioni
            </Button>
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
