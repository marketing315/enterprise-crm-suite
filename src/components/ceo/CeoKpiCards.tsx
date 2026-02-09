import { TrendingUp, TrendingDown, Euro, Percent, Target, Wallet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ConfidenceBadge } from './ConfidenceBadge';
import { formatCurrency, formatPercent } from '@/lib/formatKpi';
import type { CeoKpi } from '@/types/company';

interface CeoKpiCardsProps {
  data: CeoKpi;
}

export function CeoKpiCards({ data }: CeoKpiCardsProps) {
  const navigate = useNavigate();

  const kpis = [
    {
      title: 'Utile Netto Stimato',
      value: formatCurrency(data.estimated_net_profit),
      icon: Euro,
      trend: data.revenue_change_percent,
      confidence: data.confidence.estimated_net_profit,
      factors: data.confidence.factors,
      color: data.estimated_net_profit >= 0 ? 'text-green-600' : 'text-red-600',
    },
    {
      title: 'Margine Lordo',
      value: formatPercent(data.gross_margin_percent),
      icon: Percent,
      subtitle: formatCurrency(data.gross_margin),
      confidence: data.confidence.overall,
      color: data.gross_margin_percent >= 20 ? 'text-green-600' : 'text-yellow-600',
    },
    {
      title: 'ROI Marketing',
      value: formatPercent(data.marketing_roi),
      icon: Target,
      subtitle: `Spesa: ${formatCurrency(data.marketing_spend)}`,
      confidence: data.confidence.marketing_roi,
      color: data.marketing_roi >= 100 ? 'text-green-600' : 'text-red-600',
    },
    {
      title: 'Fatturato',
      value: formatCurrency(data.revenue_total),
      icon: TrendingUp,
      trend: data.revenue_change_percent,
      href: '/azienda',
    },
    {
      title: 'Costi Totali',
      value: formatCurrency(data.costs_total),
      icon: Wallet,
      trend: data.costs_change_percent,
      invertTrend: true,
      href: '/azienda/costi',
    },
    {
      title: 'Budget Disponibile',
      value: formatCurrency(data.budget_baseline.remaining_allocable),
      icon: Target,
      subtitle: `${formatPercent(data.budget_baseline.variance_percent)} del budget`,
      color: data.budget_baseline.variance >= 0 ? 'text-green-600' : 'text-red-600',
      href: '/azienda/budget',
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {kpis.map((kpi, idx) => (
        <Card key={idx}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {kpi.title}
            </CardTitle>
            <kpi.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className={`text-2xl font-bold ${kpi.color || ''}`}>
                {kpi.value}
              </span>
              {kpi.confidence !== undefined && (
                <ConfidenceBadge 
                  value={kpi.confidence} 
                  factors={kpi.factors}
                />
              )}
            </div>
            
            {kpi.subtitle && (
              <p className="text-xs text-muted-foreground mt-1">
                {kpi.subtitle}
              </p>
            )}
            
            {kpi.trend !== undefined && (
              <div className="flex items-center gap-1 mt-1">
                {(kpi.invertTrend ? kpi.trend <= 0 : kpi.trend >= 0) ? (
                  <TrendingUp className="h-3 w-3 text-green-600" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-red-600" />
                )}
                <span className={`text-xs ${
                  (kpi.invertTrend ? kpi.trend <= 0 : kpi.trend >= 0) 
                    ? 'text-green-600' 
                    : 'text-red-600'
                }`}>
                  {kpi.trend >= 0 ? '+' : ''}{kpi.trend.toFixed(1)}% vs periodo prec.
                </span>
              </div>
            )}

            {kpi.href && (
              <Button
                variant="link"
                size="sm"
                className="px-0 mt-1 h-auto text-xs"
                onClick={() => navigate(kpi.href!)}
              >
                Dettagli →
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
