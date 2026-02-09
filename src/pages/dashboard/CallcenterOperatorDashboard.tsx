import { useQuery } from '@tanstack/react-query';
import { startOfDay, endOfDay } from 'date-fns';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { DashboardKpiGrid, KpiItem } from '@/components/dashboard/DashboardKpiGrid';
import { Phone, PhoneCall, Calendar, Clock, Ticket } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useBrandFilter } from '@/hooks/useBrandFilter';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';

export default function CallcenterOperatorDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { getBrandIds, getQueryKeyBrand, isQueryEnabled } = useBrandFilter();

  const today = new Date();
  const todayStart = startOfDay(today).toISOString();
  const todayEnd = endOfDay(today).toISOString();

  // Calls made today by this operator
  const { data: callsToday = 0, isLoading: callsLoading } = useQuery({
    queryKey: ['operator-calls-today', user?.id, getQueryKeyBrand()],
    queryFn: async () => {
      if (!user?.id) return 0;
      const brandIds = getBrandIds();
      if (brandIds.length === 0) return 0;

      let query = supabase
        .from('call_logs')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('started_at', todayStart)
        .lte('started_at', todayEnd);

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

  // Tickets assigned to this operator (open)
  const { data: myTickets = 0, isLoading: ticketsLoading } = useQuery({
    queryKey: ['operator-my-tickets', user?.id, getQueryKeyBrand()],
    queryFn: async () => {
      if (!user?.id) return 0;
      const brandIds = getBrandIds();
      if (brandIds.length === 0) return 0;

      let query = supabase
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .eq('assigned_to', user.id)
        .in('status', ['open', 'in_progress', 'reopened']);

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

  // Appointments today for this operator
  const { data: appointmentsToday = 0, isLoading: apptLoading } = useQuery({
    queryKey: ['operator-appointments-today', user?.id, getQueryKeyBrand()],
    queryFn: async () => {
      if (!user?.id) return 0;
      const brandIds = getBrandIds();
      if (brandIds.length === 0) return 0;

      let query = supabase
        .from('appointments')
        .select('*', { count: 'exact', head: true })
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

  // Upcoming callbacks (automation_jobs for this user, pending, next 60 min)
  const { data: upcomingCallbacks = [], isLoading: cbLoading } = useQuery({
    queryKey: ['operator-callbacks', user?.id, getQueryKeyBrand()],
    queryFn: async () => {
      if (!user?.id) return [];
      const brandIds = getBrandIds();
      if (brandIds.length === 0) return [];

      const now = new Date().toISOString();
      const in60min = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      let query = supabase
        .from('automation_jobs')
        .select('id, run_at, payload, contact_id, status')
        .eq('status', 'pending')
        .eq('job_type', 'callback')
        .gte('run_at', now)
        .lte('run_at', in60min)
        .order('run_at', { ascending: true })
        .limit(10);

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

  const kpis: KpiItem[] = [
    {
      title: 'Chiamate oggi',
      value: callsToday,
      subtitle: 'Le tue chiamate',
      icon: Phone,
      variant: 'default',
    },
    {
      title: 'Ticket assegnati',
      value: myTickets,
      subtitle: 'Da gestire',
      icon: Ticket,
      variant: myTickets > 5 ? 'warning' : 'default',
    },
    {
      title: 'Appuntamenti oggi',
      value: appointmentsToday,
      subtitle: 'Programmati',
      icon: Calendar,
      variant: 'default',
    },
    {
      title: 'Ricontatti prossimi 60 min',
      value: upcomingCallbacks.length,
      subtitle: 'In coda',
      icon: Clock,
      variant: upcomingCallbacks.length > 0 ? 'warning' : 'default',
    },
  ];

  const isLoading = callsLoading || ticketsLoading || apptLoading;

  return (
    <DashboardShell
      title="Dashboard Operatore"
      subtitle="Chi chiamare adesso, script, risultati"
      icon={<Phone className="h-6 w-6 text-primary" />}
      queryKeys={[
        ['operator-calls-today'],
        ['operator-my-tickets'],
        ['operator-appointments-today'],
        ['operator-callbacks'],
      ]}
    >
      {/* KPI Cards */}
      <DashboardKpiGrid items={kpis} isLoading={isLoading} />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Upcoming callbacks */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-5 w-5" />
              Ricontatti in arrivo
            </CardTitle>
            <CardDescription>Prossimi 60 minuti</CardDescription>
          </CardHeader>
          <CardContent>
            {cbLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-10 bg-muted animate-pulse rounded" />
                ))}
              </div>
            ) : upcomingCallbacks.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Nessun ricontatto in coda ✓
              </p>
            ) : (
              <div className="space-y-2">
                {upcomingCallbacks.map(cb => {
                  const runAt = new Date(cb.run_at);
                  const minutesAway = Math.max(0, Math.round((runAt.getTime() - Date.now()) / 60000));
                  return (
                    <div
                      key={cb.id}
                      className="flex items-center justify-between p-2 rounded-md bg-muted/50"
                    >
                      <div>
                        <p className="text-sm font-medium">
                          Ricontatto #{cb.id.slice(0, 8)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {runAt.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <Badge variant={minutesAway <= 10 ? 'destructive' : 'secondary'}>
                        {minutesAway} min
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Azioni rapide</CardTitle>
            <CardDescription>Operatività</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => navigate('/contacts')}
            >
              <PhoneCall className="h-4 w-4" />
              Cerca contatto / Chiama
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => navigate('/tickets')}
            >
              <Ticket className="h-4 w-4" />
              I miei ticket
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => navigate('/appointments')}
            >
              <Calendar className="h-4 w-4" />
              Appuntamenti
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => navigate('/events')}
            >
              <Clock className="h-4 w-4" />
              Eventi / Lead
            </Button>
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
