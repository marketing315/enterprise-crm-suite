import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, Eye, MousePointer, Percent, DollarSign, Users, Repeat, Target, CalendarCheck } from "lucide-react";
import type { AdPlatformStatSummary } from "@/types/adPlatform";

interface AdStatsKpiCardsProps {
  summary: AdPlatformStatSummary | null | undefined;
  isLoading: boolean;
  appointments?: number | null;
}

export function AdStatsKpiCards({ summary, isLoading, appointments }: AdStatsKpiCardsProps) {
  const kpis = [
    {
      label: "Spesa ADV",
      value: summary?.total_spend ?? 0,
      format: (v: number) => `€${v.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      icon: DollarSign,
      color: "text-red-500",
    },
    {
      label: "Lead",
      value: summary?.total_leads ?? 0,
      format: (v: number) => v.toLocaleString("it-IT"),
      icon: Users,
      color: "text-emerald-500",
    },
    {
      label: "CPL",
      value: summary?.avg_cpl ?? null,
      format: (v: number | null) => v !== null ? `€${v.toFixed(2)}` : "—",
      icon: Target,
      color: "text-amber-500",
      highlight: true,
    },
    {
      label: "Appuntamenti",
      value: appointments ?? 0,
      format: (v: number) => v.toLocaleString("it-IT"),
      icon: CalendarCheck,
      color: "text-teal-500",
    },
    {
      label: "Impression",
      value: summary?.total_impressions ?? 0,
      format: (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v.toString(),
      icon: Eye,
      color: "text-blue-500",
    },
    {
      label: "Reach",
      value: summary?.total_reach ?? 0,
      format: (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v.toString(),
      icon: Users,
      color: "text-indigo-500",
    },
    {
      label: "Click",
      value: summary?.total_clicks ?? 0,
      format: (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v.toString(),
      icon: MousePointer,
      color: "text-green-500",
    },
    {
      label: "CTR",
      value: summary?.avg_ctr ?? null,
      format: (v: number | null) => v !== null ? `${v.toFixed(2)}%` : "—",
      icon: Percent,
      color: "text-purple-500",
    },
    {
      label: "CPC",
      value: summary?.avg_cpc ?? null,
      format: (v: number | null) => v !== null ? `€${v.toFixed(2)}` : "—",
      icon: TrendingUp,
      color: "text-orange-500",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
      {kpis.map((kpi) => (
        <Card key={kpi.label} className={(kpi as any).highlight ? "border-amber-500/50 bg-amber-500/5" : ""}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
              <span className="text-xs text-muted-foreground">{kpi.label}</span>
            </div>
            {isLoading ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              <div className={`text-xl font-bold ${(kpi as any).highlight ? "text-amber-600 dark:text-amber-400" : ""}`}>
                {kpi.format(kpi.value as number)}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
