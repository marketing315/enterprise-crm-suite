import { useQuery } from '@tanstack/react-query';
import { startOfDay, endOfDay, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, format, subDays } from 'date-fns';
import { it } from 'date-fns/locale';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { DashboardKpiGrid, KpiItem } from '@/components/dashboard/DashboardKpiGrid';
import { Target, Kanban, Flame, Calendar, Euro, Lightbulb, X, CalendarClock, AlertTriangle, TrendingDown } from 'lucide-react';
import { RiskScoreBadge } from '@/features/appointments/RiskScoreBadge';
import { TodayAppointmentsBoard } from '@/features/appointments/TodayAppointmentsBoard';
import { getStatusMeta } from '@/features/appointments/taxonomy';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useBrandFilter } from '@/hooks/useBrandFilter';
import { supabase } from '@/integrations/supabase/client';
import { untypedClient } from '@/integrations/supabase/untypedClient';
import { useMyActionSuggestions, useDismissSuggestion, useMarkSuggestionActed } from '@/hooks/useActionSuggestions';
import { useNavigate } from 'react-router-dom';
import { formatCurrency } from '@/lib/formatKpi';
import { onActivateKey } from "@/lib/a11y";
import { useIsMobile } from '@/hooks/use-mobile';
import { MobileSalespersonDashboard } from '@/components/sales/mobile/MobileSalespersonDashboard';

export default function SalespersonDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { getBrandIds, getQueryKeyBrand, isQueryEnabled } = useBrandFilter();
  const isMobile = useIsMobile();
  if (isMobile) return <MobileSalespersonDashboard />;

  const today = new Date();
  const todayStart = startOfDay(today).toISOString();
  const todayEnd = endOfDay(today).toISOString();
  const monthStart = startOfMonth(today).toISOString();
  const monthEnd = endOfMonth(today).toISOString();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 }).toISOString();
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 }).toISOString();
  const last30Start = startOfDay(subDays(today, 30)).toISOString();
  const next7End = endOfDay(addDays(today, 7)).toISOString();

  // My open deals
  const { data: myDeals = [], isLoading: dealsLoading } = useQuery({
    queryKey: ['salesperson-my-deals', user?.id, getQueryKeyBrand()],
    queryFn: async () => {
      if (!user?.id) return [];
      const brandIds = getBrandIds();
      if (brandIds.length === 0) return [];

      let query = untypedClient
        .from('deals')
        .select(`
          id, value, status, updated_at, deal_score, deal_risk_level, current_stage_id,
          contact:contacts(id, first_name, last_name, email)
        `)
        .eq('assigned_user_id', user.id)
        .eq('status', 'open')
        .order('updated_at', { ascending: false });

      if (brandIds.length === 1) {
        query = query.eq('brand_id', brandIds[0]);
      } else {
        query = query.in('brand_id', brandIds);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id && isQueryEnabled(),
  });

  // My won deals this month (sales)
  const { data: salesMonth = 0, isLoading: salesLoading } = useQuery({
    queryKey: ['salesperson-sales-month', user?.id, getQueryKeyBrand()],
    queryFn: async () => {
      if (!user?.id) return 0;
      const brandIds = getBrandIds();
      if (brandIds.length === 0) return 0;

      let query = supabase
        .from('deals')
        .select('value')
        .eq('assigned_user_id', user.id)
        .eq('status', 'won')
        .gte('closed_at', monthStart)
        .lte('closed_at', monthEnd);

      if (brandIds.length === 1) {
        query = query.eq('brand_id', brandIds[0]);
      } else {
        query = query.in('brand_id', brandIds);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).reduce((sum: number, d: any) => sum + (d.value ?? 0), 0);
    },
    enabled: !!user?.id && isQueryEnabled(),
  });

  // My appointments today
  const { data: appointmentsToday = 0, isLoading: apptLoading } = useQuery({
    queryKey: ['salesperson-appointments-today', user?.id, getQueryKeyBrand()],
    queryFn: async () => {
      if (!user?.id) return 0;
      const brandIds = getBrandIds();
      if (brandIds.length === 0) return 0;

      let query = supabase
        .from('appointments')
        .select('*', { count: 'exact', head: true })
        .eq('assigned_sales_user_id', user.id)
        .gte('scheduled_at', todayStart)
        .lte('scheduled_at', todayEnd);

      if (brandIds.length === 1) {
        query = query.eq('brand_id', brandIds[0]);
      } else {
        query = query.in('brand_id', brandIds);
      }

      const { count, error } = await query;
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!user?.id && isQueryEnabled(),
  });

  // My appointments — week, upcoming list, no-show 30d, follow-ups
  const { data: apptStats, isLoading: apptStatsLoading } = useQuery({
    queryKey: ['salesperson-appt-stats', user?.id, getQueryKeyBrand()],
    queryFn: async () => {
      if (!user?.id) return null;
      const brandIds = getBrandIds();
      if (brandIds.length === 0) return null;

      const baseFilter = (q: any) => brandIds.length === 1 ? q.eq('brand_id', brandIds[0]) : q.in('brand_id', brandIds);

      // Week count
      const weekQ = baseFilter(
        supabase.from('appointments')
          .select('*', { count: 'exact', head: true })
          .eq('assigned_sales_user_id', user.id)
          .gte('scheduled_at', weekStart)
          .lte('scheduled_at', weekEnd)
      );

      // Last 30d closed → calc no-show rate
      const closedQ = baseFilter(
        supabase.from('appointments')
          .select('status')
          .eq('assigned_sales_user_id', user.id)
          .gte('scheduled_at', last30Start)
          .lte('scheduled_at', todayEnd)
          .in('status', ['completed', 'visited', 'no_show', 'cancelled'])
          .limit(500)
      );

      // Pending follow-up: outcomes with next_action_at <= today
      const followUpQ = baseFilter(
        supabase.from('appointment_outcomes')
          .select('id, appointments!inner(assigned_sales_user_id, brand_id)', { count: 'exact', head: true })
          .eq('appointments.assigned_sales_user_id', user.id)
          .not('next_action_at', 'is', null)
          .lte('next_action_at', todayEnd)
      );

      const [weekRes, closedRes, followUpRes] = await Promise.all([weekQ, closedQ, followUpQ]);
      if (weekRes.error) throw weekRes.error;
      if (closedRes.error) throw closedRes.error;

      const closed = (closedRes.data ?? []) as { status: string }[];
      const noShows = closed.filter(a => a.status === 'no_show').length;
      const noShowRate = closed.length > 0 ? (noShows / closed.length) * 100 : 0;

      return {
        weekCount: weekRes.count ?? 0,
        noShowRate,
        closedSample: closed.length,
        pendingFollowUp: followUpRes.count ?? 0,
      };
    },
    enabled: !!user?.id && isQueryEnabled(),
  });

  // Upcoming appointments (next 7 days) with risk score
  const { data: upcomingAppts = [], isLoading: upcomingLoading } = useQuery({
    queryKey: ['salesperson-upcoming-appts', user?.id, getQueryKeyBrand()],
    queryFn: async () => {
      if (!user?.id) return [];
      const brandIds = getBrandIds();
      if (brandIds.length === 0) return [];

      let query = supabase
        .from('appointments')
        .select(`id, scheduled_at, status, risk_score, address, city,
                 contact:contacts(id, first_name, last_name)`)
        .eq('assigned_sales_user_id', user.id)
        .gte('scheduled_at', todayStart)
        .lte('scheduled_at', next7End)
        .not('status', 'in', '(cancelled,no_show,completed,visited)')
        .order('scheduled_at', { ascending: true })
        .limit(8);

      if (brandIds.length === 1) query = query.eq('brand_id', brandIds[0]);
      else query = query.in('brand_id', brandIds);

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id && isQueryEnabled(),
  });

  // Action suggestions
  const { data: suggestions = [], isLoading: sugLoading } = useMyActionSuggestions();
  const dismissSuggestion = useDismissSuggestion();
  const actSuggestion = useMarkSuggestionActed();

  // Derived data
  const pipelineValue = myDeals.reduce((sum: number, d: any) => sum + (d.value ?? 0), 0);
  const hotDeals = myDeals.filter((d: any) => (d.deal_score ?? 0) >= 60);

  const kpis: KpiItem[] = [
    {
      title: 'Deal attivi',
      value: myDeals.length,
      subtitle: `${hotDeals.length} caldi`,
      icon: Kanban,
      variant: 'default',
    },
    {
      title: 'Pipeline personale',
      value: formatCurrency(pipelineValue),
      subtitle: 'Valore deal aperti',
      icon: Euro,
      variant: 'default',
    },
    {
      title: 'Vendite mese',
      value: formatCurrency(salesMonth),
      subtitle: 'Deal vinti',
      icon: Target,
      variant: salesMonth > 0 ? 'success' : 'default',
    },
    {
      title: 'Appuntamenti oggi',
      value: appointmentsToday,
      subtitle: `${apptStats?.weekCount ?? 0} questa settimana`,
      icon: Calendar,
      variant: 'default',
    },
    {
      title: 'No-show rate',
      value: `${(apptStats?.noShowRate ?? 0).toFixed(0)}%`,
      subtitle: `Ultimi 30gg (${apptStats?.closedSample ?? 0})`,
      icon: TrendingDown,
      variant: (apptStats?.noShowRate ?? 0) > 15 ? 'destructive' : (apptStats?.noShowRate ?? 0) > 8 ? 'warning' : 'success',
    },
    {
      title: 'Follow-up pendenti',
      value: apptStats?.pendingFollowUp ?? 0,
      subtitle: 'Azioni in scadenza',
      icon: AlertTriangle,
      variant: (apptStats?.pendingFollowUp ?? 0) > 0 ? 'warning' : 'default',
    },
  ];

  const isLoading = dealsLoading || salesLoading || apptLoading || apptStatsLoading;

  return (
    <DashboardShell
      title="Dashboard Venditore"
      subtitle="Chiudere: follow-up, deal caldi, agenda, vendite"
      icon={<Target className="h-6 w-6 text-primary" />}
      queryKeys={[
        ['salesperson-my-deals'],
        ['salesperson-sales-month'],
        ['salesperson-appointments-today'],
        ['salesperson-appointments-day'],
        ['salesperson-appt-stats'],
        ['salesperson-upcoming-appts'],
        ['my-action-suggestions'],
      ]}
    >
      {/* Agenda di oggi con esitazione rapida */}
      <TodayAppointmentsBoard />

      {/* KPI Cards */}
      <DashboardKpiGrid items={kpis} isLoading={isLoading} />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Today Focus - AI suggestions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Lightbulb className="h-5 w-5 text-primary" />
              Today Focus
            </CardTitle>
            <CardDescription>Azioni consigliate</CardDescription>
          </CardHeader>
          <CardContent>
            {sugLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-14 bg-muted animate-pulse rounded" />
                ))}
              </div>
            ) : suggestions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Nessun suggerimento attivo. Ottimo lavoro! 🎯
              </p>
            ) : (
              <div className="space-y-2">
                {suggestions.slice(0, 5).map(sug => (
                  <div
                    key={sug.id}
                    className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{sug.title}</p>
                      {sug.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {sug.description}
                        </p>
                      )}
                      <Badge variant="outline" className="mt-1 text-xs">
                        {Math.round(sug.confidence * 100)}% conf.
                      </Badge>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => actSuggestion.mutate(sug.id)}
                       aria-label="Obiettivo">
                        <Target className="h-3.5 w-3.5 text-primary" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => dismissSuggestion.mutate(sug.id)}
                       aria-label="Chiudi">
                        <X className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Hot Deals */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Flame className="h-5 w-5 text-destructive" />
              Deal caldi ({hotDeals.length})
            </CardTitle>
            <CardDescription>Score ≥ 60</CardDescription>
          </CardHeader>
          <CardContent>
            {hotDeals.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Nessun deal caldo al momento
              </p>
            ) : (
              <div className="max-h-[300px] overflow-auto space-y-2">
                {hotDeals.map((deal: any) => (
                  <div
                    key={deal.id}
                    role="button"
                    tabIndex={0}
                    className="flex items-center justify-between p-2 rounded-md bg-muted/50 hover:bg-muted cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => navigate('/pipeline')}
                    onKeyDown={onActivateKey(() => navigate('/pipeline'))}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {deal.contact?.first_name} {deal.contact?.last_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {deal.value ? formatCurrency(deal.value) : 'Nessun valore'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge
                        variant={deal.deal_risk_level === 'critical' ? 'destructive' : 'secondary'}
                      >
                        Score: {deal.deal_score ?? '—'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Upcoming Appointments */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarClock className="h-5 w-5 text-primary" />
                Prossimi appuntamenti
              </CardTitle>
              <CardDescription>I tuoi impegni nei prossimi 7 giorni</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate('/appointments/calendar')}>
              Apri calendario
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {upcomingLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-12 bg-muted animate-pulse rounded" />
              ))}
            </div>
          ) : upcomingAppts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nessun appuntamento nei prossimi 7 giorni
            </p>
          ) : (
            <div className="space-y-2">
              {upcomingAppts.map((appt: any) => {
                const statusMeta = getStatusMeta(appt.status);
                const StatusIcon = statusMeta.icon;
                return (
                  <div
                    key={appt.id}
                    role="button"
                    tabIndex={0}
                    className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => navigate(`/appointments/${appt.id}`)}
                    onKeyDown={onActivateKey(() => navigate(`/appointments/${appt.id}`))}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex flex-col items-center justify-center w-12 shrink-0 text-center">
                        <span className="text-[10px] uppercase text-muted-foreground font-medium">
                          {format(new Date(appt.scheduled_at), 'EEE', { locale: it })}
                        </span>
                        <span className="text-lg font-semibold leading-none">
                          {format(new Date(appt.scheduled_at), 'dd')}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {format(new Date(appt.scheduled_at), 'HH:mm')}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {appt.contact?.first_name} {appt.contact?.last_name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {appt.city || appt.address || '—'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <RiskScoreBadge score={appt.risk_score} size="sm" />
                      <Badge variant="outline" className={`text-xs gap-1 ${statusMeta.badgeClass}`}>
                        <StatusIcon className="h-3 w-3" />
                        {statusMeta.shortLabel}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-3">
        <Button variant="outline" className="h-auto py-4 flex-col gap-1" onClick={() => navigate('/pipeline')}>
          <Kanban className="h-5 w-5" />
          <span className="text-sm font-medium">Pipeline</span>
        </Button>
        <Button variant="outline" className="h-auto py-4 flex-col gap-1" onClick={() => navigate('/appointments')}>
          <Calendar className="h-5 w-5" />
          <span className="text-sm font-medium">Appuntamenti</span>
        </Button>
        <Button variant="outline" className="h-auto py-4 flex-col gap-1" onClick={() => navigate('/sales')}>
          <Euro className="h-5 w-5" />
          <span className="text-sm font-medium">Vendite</span>
        </Button>
      </div>
    </DashboardShell>
  );
}
