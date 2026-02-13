import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Eye,
  MousePointerClick,
  Users,
  Phone,
  PhoneIncoming,
  Calendar,
  Trophy,
  ArrowRight,
} from "lucide-react";
import type { FunnelMetrics } from "@/hooks/useFunnelMetrics";

interface MarketingMiniFunnelProps {
  metrics: FunnelMetrics | undefined;
  isLoading: boolean;
}

interface FunnelStage {
  label: string;
  value: number;
  icon: typeof Eye;
  color: string;
  bgColor: string;
}

function formatFunnelValue(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return v.toLocaleString("it-IT");
}

function conversionRate(from: number, to: number): string {
  if (!from || from === 0) return "—";
  return `${((to / from) * 100).toFixed(1)}%`;
}

export function MarketingMiniFunnel({ metrics, isLoading }: MarketingMiniFunnelProps) {
  if (isLoading) {
    return (
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Funnel di Conversione</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <Skeleton className="h-16 w-20 rounded-xl" />
                {i < 6 && <Skeleton className="h-4 w-4" />}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!metrics) {
    return (
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Funnel di Conversione</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            Nessun dato disponibile per il periodo selezionato.
          </p>
        </CardContent>
      </Card>
    );
  }

  const stages: FunnelStage[] = [
    {
      label: "Impressions",
      value: metrics.impressions,
      icon: Eye,
      color: "text-violet-600 dark:text-violet-400",
      bgColor: "bg-violet-100/60 dark:bg-violet-900/30",
    },
    {
      label: "Click",
      value: metrics.clicks,
      icon: MousePointerClick,
      color: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-100/60 dark:bg-blue-900/30",
    },
    {
      label: "Lead",
      value: metrics.leads,
      icon: Users,
      color: "text-cyan-600 dark:text-cyan-400",
      bgColor: "bg-cyan-100/60 dark:bg-cyan-900/30",
    },
    {
      label: "Chiamati",
      value: metrics.called_contacts,
      icon: Phone,
      color: "text-amber-600 dark:text-amber-400",
      bgColor: "bg-amber-100/60 dark:bg-amber-900/30",
    },
    {
      label: "Risposte",
      value: metrics.answered_contacts,
      icon: PhoneIncoming,
      color: "text-orange-600 dark:text-orange-400",
      bgColor: "bg-orange-100/60 dark:bg-orange-900/30",
    },
    {
      label: "Appuntamenti",
      value: metrics.appointments,
      icon: Calendar,
      color: "text-emerald-600 dark:text-emerald-400",
      bgColor: "bg-emerald-100/60 dark:bg-emerald-900/30",
    },
    {
      label: "Vendite",
      value: metrics.sales,
      icon: Trophy,
      color: "text-yellow-600 dark:text-yellow-400",
      bgColor: "bg-yellow-100/60 dark:bg-yellow-900/30",
    },
  ];

  // Calculate max for relative bar widths
  const maxVal = Math.max(...stages.map((s) => s.value), 1);

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Funnel di Conversione</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Desktop: horizontal flow */}
        <div className="hidden md:flex items-end gap-1 justify-between">
          {stages.map((stage, i) => {
            const barHeight = Math.max(20, (stage.value / maxVal) * 100);
            const prevVal = i > 0 ? stages[i - 1].value : 0;
            const rate = i > 0 ? conversionRate(prevVal, stage.value) : null;

            return (
              <div key={stage.label} className="flex items-end gap-1">
                <div className="flex flex-col items-center gap-1 min-w-[72px]">
                  {/* Conversion rate arrow */}
                  {rate && (
                    <div className="flex items-center gap-0.5 mb-1">
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <span className="text-[10px] font-medium text-muted-foreground">{rate}</span>
                    </div>
                  )}
                  {/* Bar */}
                  <div
                    className={`w-12 rounded-t-lg ${stage.bgColor} transition-all duration-500`}
                    style={{ height: `${barHeight}px` }}
                  />
                  {/* Value */}
                  <span className={`text-sm font-bold ${stage.color}`}>
                    {formatFunnelValue(stage.value)}
                  </span>
                  {/* Icon + label */}
                  <div className="flex flex-col items-center gap-0.5">
                    <stage.icon className={`h-3.5 w-3.5 ${stage.color}`} />
                    <span className="text-[10px] text-muted-foreground text-center leading-tight">
                      {stage.label}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Mobile: vertical list */}
        <div className="md:hidden space-y-2">
          {stages.map((stage, i) => {
            const barWidth = Math.max(10, (stage.value / maxVal) * 100);
            const prevVal = i > 0 ? stages[i - 1].value : 0;
            const rate = i > 0 ? conversionRate(prevVal, stage.value) : null;

            return (
              <div key={stage.label}>
                {rate && (
                  <div className="flex items-center gap-1 ml-6 mb-0.5">
                    <ArrowRight className="h-3 w-3 text-muted-foreground rotate-90" />
                    <span className="text-[10px] font-medium text-muted-foreground">{rate}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded-lg ${stage.bgColor}`}>
                    <stage.icon className={`h-3.5 w-3.5 ${stage.color}`} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs text-muted-foreground">{stage.label}</span>
                      <span className={`text-sm font-bold ${stage.color}`}>
                        {formatFunnelValue(stage.value)}
                      </span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${stage.bgColor} transition-all duration-500`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Overall conversion */}
        {metrics.conversions?.overall != null && (
          <div className="mt-4 pt-3 border-t flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Conversione totale (Impression → Vendita)</span>
            <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
              {metrics.conversions.overall.toFixed(2)}%
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
