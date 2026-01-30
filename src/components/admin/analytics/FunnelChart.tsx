import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FunnelAnalytics, FunnelStage } from "@/hooks/useAdvancedAnalytics";
import { cn } from "@/lib/utils";
import { ArrowRight, Clock, TrendingDown } from "lucide-react";

interface FunnelChartProps {
  data?: FunnelAnalytics;
  isLoading?: boolean;
}

function FunnelStageBar({ stage, maxDeals, index }: { stage: FunnelStage; maxDeals: number; index: number }) {
  const widthPercent = maxDeals > 0 ? (stage.deals_entered / maxDeals) * 100 : 0;
  const dropOff = stage.deals_entered - stage.deals_exited_to_next - stage.deals_won;
  
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <div 
            className="w-3 h-3 rounded-full" 
            style={{ backgroundColor: stage.stage_color || 'hsl(var(--primary))' }}
          />
          <span className="font-medium">{stage.stage_name}</span>
        </div>
        <div className="flex items-center gap-4 text-muted-foreground">
          <span className="text-xs flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {stage.avg_days_in_stage}g
          </span>
          <span className="font-medium text-foreground">{stage.deals_entered}</span>
        </div>
      </div>
      
      <div className="relative h-10 bg-muted/50 rounded-lg overflow-hidden">
        <div 
          className="absolute inset-y-0 left-0 rounded-lg transition-all duration-500 flex items-center justify-end pr-3"
          style={{ 
            width: `${Math.max(widthPercent, 5)}%`,
            backgroundColor: stage.stage_color || 'hsl(var(--primary))',
            opacity: 0.8
          }}
        >
          {widthPercent > 20 && (
            <span className="text-xs font-medium text-white">
              {stage.conversion_rate}%
            </span>
          )}
        </div>
        {widthPercent <= 20 && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
            {stage.conversion_rate}%
          </span>
        )}
      </div>

      {dropOff > 0 && (
        <div className="flex items-center gap-1 text-xs text-destructive">
          <TrendingDown className="h-3 w-3" />
          <span>-{dropOff} deal persi</span>
        </div>
      )}
    </div>
  );
}

export function FunnelChart({ data, isLoading }: FunnelChartProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Funnel Pipeline</CardTitle>
          <CardDescription>Conversione per stage</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-2">
                <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                <div className="h-10 bg-muted animate-pulse rounded-lg" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const stages = data?.stages ?? [];
  const maxDeals = Math.max(...stages.map(s => s.deals_entered), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Funnel Pipeline</CardTitle>
        <CardDescription>
          {data?.total_deals ?? 0} deal totali • Win Rate {data?.overall_win_rate ?? 0}%
        </CardDescription>
      </CardHeader>
      <CardContent>
        {stages.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Nessun dato disponibile per il periodo selezionato
          </div>
        ) : (
          <div className="space-y-6">
            {stages.map((stage, index) => (
              <div key={stage.stage_id}>
                <FunnelStageBar stage={stage} maxDeals={maxDeals} index={index} />
                {index < stages.length - 1 && (
                  <div className="flex justify-center py-2">
                    <ArrowRight className="h-4 w-4 text-muted-foreground rotate-90" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Summary stats */}
        <div className="mt-6 pt-6 border-t grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold">{data?.total_deals ?? 0}</p>
            <p className="text-xs text-muted-foreground">Deal Totali</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-500">{data?.overall_win_rate ?? 0}%</p>
            <p className="text-xs text-muted-foreground">Win Rate</p>
          </div>
          <div>
            <p className="text-2xl font-bold">{data?.avg_deal_velocity_days ?? 0}g</p>
            <p className="text-xs text-muted-foreground">Velocity Media</p>
          </div>
          <div>
            <p className="text-2xl font-bold">
              €{((data?.total_pipeline_value ?? 0) / 1000).toFixed(0)}K
            </p>
            <p className="text-xs text-muted-foreground">Pipeline Value</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
