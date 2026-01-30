import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, DollarSign, Timer, Target, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { FunnelAnalytics, SourceAnalytics, VelocityMetrics } from "@/hooks/useAdvancedAnalytics";

interface AnalyticsKpiCardsProps {
  funnel?: FunnelAnalytics;
  sources?: SourceAnalytics;
  velocity?: VelocityMetrics;
  isLoading?: boolean;
}

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: number;
  trendLabel?: string;
  isLoading?: boolean;
}

function KpiCard({ title, value, subtitle, icon, trend, trendLabel, isLoading }: KpiCardProps) {
  const hasTrend = trend !== undefined && trend !== 0;
  const isPositive = (trend ?? 0) > 0;

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4 md:p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1 flex-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            {isLoading ? (
              <div className="h-8 w-24 bg-muted animate-pulse rounded" />
            ) : (
              <p className="text-2xl md:text-3xl font-bold tracking-tight">{value}</p>
            )}
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            {icon}
          </div>
        </div>
        {hasTrend && (
          <div className={cn(
            "flex items-center gap-1 mt-3 text-xs font-medium",
            isPositive ? "text-emerald-600 dark:text-emerald-500" : "text-destructive"
          )}>
            {isPositive ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            <span>{Math.abs(trend).toFixed(1)}%</span>
            {trendLabel && <span className="text-muted-foreground">{trendLabel}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function AnalyticsKpiCards({ funnel, sources, velocity, isLoading }: AnalyticsKpiCardsProps) {
  const formatCurrency = (value: number) => {
    if (value >= 1000000) {
      return `€${(value / 1000000).toFixed(1)}M`;
    }
    if (value >= 1000) {
      return `€${(value / 1000).toFixed(1)}K`;
    }
    return `€${value.toFixed(0)}`;
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard
        title="Pipeline Value"
        value={formatCurrency(funnel?.total_pipeline_value ?? 0)}
        subtitle="Deal aperti"
        icon={<DollarSign className="h-5 w-5" />}
        isLoading={isLoading}
      />
      <KpiCard
        title="Win Rate"
        value={`${funnel?.overall_win_rate ?? 0}%`}
        subtitle="Tasso di chiusura"
        icon={<Target className="h-5 w-5" />}
        isLoading={isLoading}
      />
      <KpiCard
        title="Deal Velocity"
        value={`${velocity?.avg_days_to_win ?? 0}g`}
        subtitle="Giorni medi a chiusura"
        icon={<Timer className="h-5 w-5" />}
        isLoading={isLoading}
      />
      <KpiCard
        title="Lead Totali"
        value={sources?.total_leads ?? 0}
        subtitle={`${sources?.total_deals_won ?? 0} convertiti`}
        icon={<Users className="h-5 w-5" />}
        isLoading={isLoading}
      />
    </div>
  );
}
