import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfidenceBadge } from "@/components/ceo/ConfidenceBadge";
import { TrendingUp, TrendingDown, RefreshCw, Target, ArrowUpRight, ArrowDownRight } from "lucide-react";
import type { ForecastResult } from "@/types/predictive";
import { cn } from "@/lib/utils";

const formatCurrency = (value: number) => 
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(value);

interface ForecastCardProps {
  forecast: ForecastResult | null;
  isLoading?: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function ForecastCard({ 
  forecast, 
  isLoading, 
  onRefresh,
  isRefreshing,
}: ForecastCardProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </CardContent>
      </Card>
    );
  }

  if (!forecast) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Target className="h-5 w-5" />
            Previsione Fatturato
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Nessuna previsione disponibile. Assicurati di avere deal aperti con valore.
          </p>
          {onRefresh && (
            <Button 
              variant="outline" 
              size="sm" 
              className="mt-4"
              onClick={onRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={cn("h-4 w-4 mr-2", isRefreshing && "animate-spin")} />
              Genera Previsione
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  const vsLastPeriod = forecast.comparison.vs_last_period;
  const vsLastYear = forecast.comparison.vs_same_period_last_year;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            Previsione {forecast.period}
          </CardTitle>
          <div className="flex items-center gap-2">
            <ConfidenceBadge value={forecast.confidence} />
            {onRefresh && (
              <Button 
                variant="ghost" 
                size="icon"
                onClick={onRefresh}
                disabled={isRefreshing}
              >
                <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main predicted value */}
        <div>
          <div className="text-3xl font-bold">
            {formatCurrency(forecast.predicted_revenue)}
          </div>
          <div className="text-sm text-muted-foreground">
            Range: {formatCurrency(forecast.range.min)} - {formatCurrency(forecast.range.max)}
          </div>
        </div>

        {/* Breakdown */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="space-y-1">
            <div className="text-muted-foreground">Da deal aperti</div>
            <div className="font-medium">
              {formatCurrency(forecast.breakdown.from_open_deals)}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-muted-foreground">Da trend storico</div>
            <div className="font-medium">
              {formatCurrency(forecast.breakdown.from_historical_trend)}
            </div>
          </div>
        </div>

        {/* Comparisons */}
        <div className="flex flex-wrap gap-2">
          {vsLastPeriod !== null && (
            <Badge variant={vsLastPeriod >= 0 ? "default" : "destructive"} className="gap-1">
              {vsLastPeriod >= 0 ? (
                <ArrowUpRight className="h-3 w-3" />
              ) : (
                <ArrowDownRight className="h-3 w-3" />
              )}
              {vsLastPeriod >= 0 ? "+" : ""}{vsLastPeriod}% vs periodo prec.
            </Badge>
          )}
          {vsLastYear !== null && (
            <Badge variant="outline" className="gap-1">
              {vsLastYear >= 0 ? (
                <TrendingUp className="h-3 w-3 text-green-600" />
              ) : (
                <TrendingDown className="h-3 w-3 text-red-600" />
              )}
              {vsLastYear >= 0 ? "+" : ""}{vsLastYear}% vs anno prec.
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
