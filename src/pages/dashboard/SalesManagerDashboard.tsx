import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { DashboardKpiGrid, KpiItem } from '@/components/dashboard/DashboardKpiGrid';
import { Kanban, TrendingUp, AlertTriangle, Target, Timer, Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useDeals, usePipelineStages } from '@/hooks/usePipeline';
import { useSalespersonKpis } from '@/hooks/useSalespersonKpis';
import { useBrandDealScores } from '@/hooks/useDealScoring';
import { useRevenueForecast } from '@/hooks/useForecast';
import { useNavigate } from 'react-router-dom';
import { formatCurrency } from '@/lib/formatKpi';
import { OverduePaymentsWidget } from '@/components/sales/OverduePaymentsWidget';
import { onActivateKey } from "@/lib/a11y";
import { useIsMobile } from '@/hooks/use-mobile';
import { MobileSalesManagerDashboard } from '@/components/sales/mobile/MobileSalesManagerDashboard';

export default function SalesManagerDashboard() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  if (isMobile) return <MobileSalesManagerDashboard />;

  const { data: openDeals, isLoading: dealsLoading } = useDeals('open');
  const { data: wonDeals, isLoading: wonLoading } = useDeals('won');
  const { data: stages } = usePipelineStages();
  const { data: salespersons, isLoading: spLoading } = useSalespersonKpis();
  const { data: riskCounts, isLoading: riskLoading } = useBrandDealScores();
  const { data: forecast, isLoading: forecastLoading } = useRevenueForecast('month');

  const openCount = openDeals?.length ?? 0;
  const wonCount = wonDeals?.length ?? 0;
  const totalWinRate = salespersons && salespersons.length > 0
    ? salespersons.reduce((sum, s) => sum + s.win_rate, 0) / salespersons.length
    : 0;

  // Weighted pipeline value
  const weightedValue = (openDeals || []).reduce((sum, d) => {
    return sum + (d.value || 0);
  }, 0);

  // Stalled deals (no update in 14+ days)
  const stalledDays = 14;
  const stalledDeals = (openDeals || []).filter(d => {
    const lastUpdate = new Date(d.updated_at);
    const diff = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);
    return diff >= stalledDays;
  });

  const atRiskCount = (riskCounts?.high ?? 0) + (riskCounts?.critical ?? 0);

  const kpis: KpiItem[] = [
    {
      title: 'Deal aperti',
      value: openCount,
      subtitle: `${wonCount} vinti`,
      icon: Kanban,
      variant: 'default',
    },
    {
      title: 'Pipeline (valore)',
      value: formatCurrency(weightedValue),
      subtitle: 'Totale deal aperti',
      icon: TrendingUp,
      variant: 'default',
    },
    {
      title: 'Win rate medio',
      value: `${totalWinRate.toFixed(0)}%`,
      subtitle: `${salespersons?.length ?? 0} venditori`,
      icon: Target,
      variant: totalWinRate >= 30 ? 'success' : totalWinRate >= 15 ? 'default' : 'warning',
    },
    {
      title: 'Deal a rischio',
      value: atRiskCount,
      subtitle: `${stalledDeals.length} in stallo (>${stalledDays}gg)`,
      icon: AlertTriangle,
      variant: atRiskCount > 0 ? 'destructive' : 'default',
    },
  ];

  const isLoading = dealsLoading || wonLoading || spLoading;

  // Funnel: count deals per stage
  const funnelData = (stages || []).map(stage => ({
    name: stage.name,
    color: stage.color,
    count: (openDeals || []).filter(d => d.current_stage_id === stage.id).length,
  }));

  return (
    <DashboardShell
      title="Responsabile Venditori"
      subtitle="Pipeline, performance venditori, rischio deal, previsione chiusure"
      icon={<Kanban className="h-6 w-6 text-primary" />}
      queryKeys={[
        ['deals'],
        ['salesperson-kpis'],
        ['brand-deal-scores'],
        ['revenue-forecast'],
      ]}
    >
      {/* KPI Cards */}
      <DashboardKpiGrid items={kpis} isLoading={isLoading || riskLoading} />

      {/* Forecast banner */}
      {forecast && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <TrendingUp className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-medium">Forecast mese</p>
                <p className="text-xs text-muted-foreground">
                  Confidenza: {(forecast.confidence * 100).toFixed(0)}%
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold text-primary">
                {formatCurrency(forecast.predicted_revenue)}
              </p>
              <p className="text-xs text-muted-foreground">
                Range: {formatCurrency(forecast.range.min)} – {formatCurrency(forecast.range.max)}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Pipeline Funnel */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Funnel Pipeline</CardTitle>
            <CardDescription>Deal per stage</CardDescription>
          </CardHeader>
          <CardContent>
            {funnelData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nessuno stage configurato</p>
            ) : (
              <div className="space-y-2">
                {funnelData.map((stage, idx) => {
                  const maxCount = Math.max(...funnelData.map(s => s.count), 1);
                  const widthPercent = (stage.count / maxCount) * 100;
                  return (
                    <div key={idx} className="flex items-center gap-3">
                      <span className="text-xs font-medium w-28 truncate">{stage.name}</span>
                      <div className="flex-1 h-6 bg-muted rounded-md overflow-hidden">
                        <div
                          className="h-full rounded-md flex items-center px-2 text-xs font-medium text-primary-foreground"
                          style={{
                            width: `${Math.max(widthPercent, 8)}%`,
                            backgroundColor: stage.color || 'hsl(var(--primary))',
                          }}
                        >
                          {stage.count}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Stalled Deals */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Timer className="h-5 w-5" />
              Deal in stallo ({stalledDeals.length})
            </CardTitle>
            <CardDescription>Fermi da più di {stalledDays} giorni</CardDescription>
          </CardHeader>
          <CardContent>
            {stalledDeals.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nessun deal in stallo 🎉
              </p>
            ) : (
              <div className="max-h-[250px] overflow-auto space-y-2">
                {stalledDeals.slice(0, 10).map(deal => {
                  const daysSinceUpdate = Math.floor(
                    (Date.now() - new Date(deal.updated_at).getTime()) / (1000 * 60 * 60 * 24)
                  );
                  return (
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
                      <Badge variant="destructive" className="shrink-0">
                        {daysSinceUpdate}gg
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Pagamenti rateali in ritardo / in scadenza */}
      <OverduePaymentsWidget />

      {/* Salesperson KPIs */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-5 w-5" />
                Performance Venditori
              </CardTitle>
              <CardDescription>KPI per venditore</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate('/team/salespersons')}>
              Dettaglio completo
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {spLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : !salespersons || salespersons.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nessun venditore trovato
            </p>
          ) : (
            <div className="max-h-[300px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Venditore</TableHead>
                    <TableHead className="text-right">Aperti</TableHead>
                    <TableHead className="text-right">Vinti</TableHead>
                    <TableHead className="text-right">Win rate</TableHead>
                    <TableHead className="text-right">Valore vinto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {salespersons.map(sp => (
                    <TableRow key={sp.user_id}>
                      <TableCell className="font-medium">
                        {sp.full_name || sp.email}
                      </TableCell>
                      <TableCell className="text-right">{sp.deals_open}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary">{sp.deals_won}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={sp.win_rate >= 30 ? 'default' : 'destructive'}>
                          {sp.win_rate.toFixed(0)}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {formatCurrency(sp.total_value_won)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </DashboardShell>
  );
}
