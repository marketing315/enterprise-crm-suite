import { useQuery } from '@tanstack/react-query';
import { startOfDay, endOfDay, startOfMonth, endOfMonth } from 'date-fns';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { DashboardKpiGrid, KpiItem } from '@/components/dashboard/DashboardKpiGrid';
import { Target, Kanban, Flame, Calendar, Euro, Lightbulb, X } from 'lucide-react';
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

export default function SalespersonDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { getBrandIds, getQueryKeyBrand, isQueryEnabled } = useBrandFilter();

  const today = new Date();
  const todayStart = startOfDay(today).toISOString();
  const todayEnd = endOfDay(today).toISOString();
  const monthStart = startOfMonth(today).toISOString();
  const monthEnd = endOfMonth(today).toISOString();

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
      subtitle: 'Programmati',
      icon: Calendar,
      variant: 'default',
    },
  ];

  const isLoading = dealsLoading || salesLoading || apptLoading;

  return (
    <DashboardShell
      title="Dashboard Venditore"
      subtitle="Chiudere: follow-up, deal caldi, agenda, vendite"
      icon={<Target className="h-6 w-6 text-primary" />}
      queryKeys={[
        ['salesperson-my-deals'],
        ['salesperson-sales-month'],
        ['salesperson-appointments-today'],
        ['my-action-suggestions'],
      ]}
    >
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
                      >
                        <Target className="h-3.5 w-3.5 text-primary" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => dismissSuggestion.mutate(sug.id)}
                      >
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
                    className="flex items-center justify-between p-2 rounded-md bg-muted/50 hover:bg-muted cursor-pointer"
                    onClick={() => navigate('/pipeline')}
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
