import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, Eye, MousePointer, Percent, DollarSign, Users, Repeat } from "lucide-react";
import type { AdPlatformStatSummary } from "@/types/adPlatform";

interface AdStatsKpiCardsProps {
  summary: AdPlatformStatSummary | null | undefined;
  isLoading: boolean;
}

export function AdStatsKpiCards({ summary, isLoading }: AdStatsKpiCardsProps) {
  const kpis = [
    {
      label: "Spesa ADV",
      value: summary?.total_spend ?? 0,
      format: (v: number) => `€${v.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      icon: DollarSign,
      color: "text-red-500",
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
      label: "Frequenza",
      value: summary?.avg_frequency ?? null,
      format: (v: number | null) => v !== null ? v.toFixed(2) : "—",
      icon: Repeat,
      color: "text-teal-500",
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
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
      {kpis.map((kpi) => (
        <Card key={kpi.label}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
              <span className="text-xs text-muted-foreground">{kpi.label}</span>
            </div>
            {isLoading ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              <div className="text-xl font-bold">
                {kpi.format(kpi.value as number)}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
