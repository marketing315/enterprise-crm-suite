import { useMemo } from 'react';
import { subDays, startOfDay, endOfDay } from 'date-fns';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { DashboardKpiGrid, KpiItem } from '@/components/dashboard/DashboardKpiGrid';
import { Headphones, Phone, PhoneCall, Calendar, Clock, Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCallcenterKpisOverview, useCallcenterKpisByOperator } from '@/hooks/useCallcenterKpis';
import { useDashboardData } from '@/hooks/useDashboardData';
import { useNavigate } from 'react-router-dom';
import { useIsMobile } from '@/hooks/use-mobile';
import { MobileCallcenterManagerDashboard } from '@/components/callcenter/mobile/MobileCallcenterManagerDashboard';

export default function CallcenterManagerDashboard() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  if (isMobile) return <MobileCallcenterManagerDashboard />;
  const now = new Date();
  const from = useMemo(() => startOfDay(subDays(now, 7)), []);
  const to = useMemo(() => endOfDay(now), []);

  const { data: overview, isLoading: overviewLoading } = useCallcenterKpisOverview(from, to);
  const { data: operators, isLoading: operatorsLoading } = useCallcenterKpisByOperator(from, to);
  const { appointmentsToday, isLoading: dashLoading } = useDashboardData();

  const kpis: KpiItem[] = [
    {
      title: 'Ticket creati (7gg)',
      value: overview?.tickets_created ?? '—',
      subtitle: `${overview?.tickets_assigned ?? 0} assegnati`,
      icon: Phone,
      variant: 'default',
    },
    {
      title: 'Ticket risolti (7gg)',
      value: overview?.tickets_resolved ?? '—',
      subtitle: `${overview?.tickets_closed ?? 0} chiusi`,
      icon: PhoneCall,
      variant: 'success',
    },
    {
      title: 'Backlog attuale',
      value: overview?.backlog_total ?? '—',
      subtitle: `${overview?.unassigned_now ?? 0} non assegnati`,
      icon: Clock,
      variant: (overview?.backlog_total ?? 0) > 20 ? 'warning' : 'default',
    },
    {
      title: 'Appuntamenti oggi',
      value: appointmentsToday,
      subtitle: 'Programmati',
      icon: Calendar,
      variant: 'default',
    },
  ];

  const isLoading = overviewLoading || dashLoading;

  return (
    <DashboardShell
      title="Responsabile Call Center"
      subtitle="Controllo team operatori, qualità contatti, SLA, produttività"
      icon={<Headphones className="h-6 w-6 text-primary" />}
      queryKeys={[
        ['callcenter-kpis-overview'],
        ['callcenter-kpis-by-operator'],
        ['dashboard-appointments-today'],
      ]}
    >
      {/* KPI Cards */}
      <DashboardKpiGrid items={kpis} isLoading={isLoading} />

      {/* Timing KPIs */}
      {overview && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Tempo medio assegnazione
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {overview.avg_time_to_assign_minutes > 0
                  ? `${Math.round(overview.avg_time_to_assign_minutes)} min`
                  : '—'}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Tempo medio risoluzione
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {overview.avg_time_to_resolve_minutes > 0
                  ? overview.avg_time_to_resolve_minutes < 60
                    ? `${Math.round(overview.avg_time_to_resolve_minutes)} min`
                    : `${(overview.avg_time_to_resolve_minutes / 60).toFixed(1)} h`
                  : '—'}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Operator Leaderboard */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-5 w-5" />
                Leaderboard Operatori
              </CardTitle>
              <CardDescription>Performance ultimi 7 giorni</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate('/admin/callcenter-kpi')}>
              Dettaglio completo
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {operatorsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : !operators || operators.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nessun operatore trovato
            </p>
          ) : (
            <div className="max-h-[350px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Operatore</TableHead>
                    <TableHead className="text-right">Assegnati</TableHead>
                    <TableHead className="text-right">Risolti</TableHead>
                    <TableHead className="text-right">Backlog</TableHead>
                    <TableHead className="text-right">Tempo medio</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {operators.map(op => (
                    <TableRow key={op.user_id}>
                      <TableCell className="font-medium">
                        {op.full_name || op.email}
                      </TableCell>
                      <TableCell className="text-right">{op.tickets_assigned}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary">{op.tickets_resolved}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={op.backlog_current > 5 ? 'destructive' : 'outline'}>
                          {op.backlog_current}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground text-sm">
                        {op.avg_time_to_resolve_minutes > 0
                          ? `${Math.round(op.avg_time_to_resolve_minutes)} min`
                          : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-3">
        <Button variant="outline" className="h-auto py-4 flex-col gap-1" onClick={() => navigate('/tickets')}>
          <Phone className="h-5 w-5" />
          <span className="text-sm font-medium">Gestisci Ticket</span>
        </Button>
        <Button variant="outline" className="h-auto py-4 flex-col gap-1" onClick={() => navigate('/appointments')}>
          <Calendar className="h-5 w-5" />
          <span className="text-sm font-medium">Appuntamenti</span>
        </Button>
        <Button variant="outline" className="h-auto py-4 flex-col gap-1" onClick={() => navigate('/admin/ticket-trend')}>
          <Clock className="h-5 w-5" />
          <span className="text-sm font-medium">Trend Ticket</span>
        </Button>
      </div>
    </DashboardShell>
  );
}
