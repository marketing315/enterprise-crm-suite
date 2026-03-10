import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Target,
  BarChart3,
  Eye,
  MousePointerClick,
  CalendarCheck,
} from "lucide-react";
import type { MarketingSummaryKpi } from "@/types/marketing";
import type { FunnelMetrics } from "@/hooks/useFunnelMetrics";
import type { AdPlatformStatSummary } from "@/types/adPlatform";

interface MarketingKpiCardsProps {
  kpis: MarketingSummaryKpi | null;
  advSummary?: AdPlatformStatSummary | null;
  funnelMetrics?: FunnelMetrics | null;
  isLoading?: boolean;
}

interface KpiCardDef {
  title: string;
  value: number | null | undefined;
  icon: typeof Users;
  format: "number" | "currency" | "percent" | "compact";
  accent?: "green" | "red" | "blue" | "amber" | "purple";
}

function formatKpiValue(value: number | null | undefined, format: string): string {
  if (value == null) return "—";
  if (format === "currency") {
    if (value >= 1000) return `€${(value / 1000).toFixed(1)}k`;
    return `€${value.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (format === "percent") return `${value.toFixed(1)}%`;
  if (format === "compact") {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
    return value.toLocaleString("it-IT");
  }
  return value.toLocaleString("it-IT");
}

const accentColors: Record<string, string> = {
  green: "text-emerald-600 dark:text-emerald-400",
  red: "text-red-500 dark:text-red-400",
  blue: "text-blue-600 dark:text-blue-400",
  amber: "text-amber-600 dark:text-amber-400",
  purple: "text-violet-600 dark:text-violet-400",
};

const accentBg: Record<string, string> = {
  green: "bg-emerald-100/60 dark:bg-emerald-900/30",
  red: "bg-red-100/60 dark:bg-red-900/30",
  blue: "bg-blue-100/60 dark:bg-blue-900/30",
  amber: "bg-amber-100/60 dark:bg-amber-900/30",
  purple: "bg-violet-100/60 dark:bg-violet-900/30",
};

export function MarketingKpiCards({ kpis, advSummary, funnelMetrics, isLoading }: MarketingKpiCardsProps) {
  const cards: KpiCardDef[] = [
    {
      title: "Lead Totali",
      value: kpis?.total_leads,
      icon: Users,
      format: "number",
      accent: "blue",
    },
    {
      title: "Spend ADV",
      value: advSummary?.total_spend ?? kpis?.total_marketing_cost,
      icon: DollarSign,
      format: "currency",
      accent: "red",
    },
    {
      title: "Ricavi",
      value: kpis?.total_revenue,
      icon: TrendingUp,
      format: "currency",
      accent: "green",
    },
    {
      title: "ROI",
      value: kpis?.overall_roi,
      icon: kpis && kpis.overall_roi >= 0 ? TrendingUp : TrendingDown,
      format: "percent",
      accent: kpis && kpis.overall_roi >= 0 ? "green" : "red",
    },
    {
      title: "CPL",
      value: advSummary?.avg_cpc != null && kpis?.avg_cpl != null ? kpis.avg_cpl : kpis?.avg_cpl,
      icon: Target,
      format: "currency",
      accent: "amber",
    },
    {
      title: "Impressions",
      value: advSummary?.total_impressions,
      icon: Eye,
      format: "compact",
      accent: "purple",
    },
    {
      title: "Click",
      value: advSummary?.total_clicks,
      icon: MousePointerClick,
      format: "compact",
      accent: "blue",
    },
    {
      title: "CTR",
      value: advSummary?.avg_ctr,
      icon: BarChart3,
      format: "percent",
      accent: "green",
    },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i} className="border-0 shadow-sm">
            <CardContent className="p-4">
              <Skeleton className="h-4 w-20 mb-3" />
              <Skeleton className="h-8 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((card) => {
        const color = card.accent || "blue";
        return (
          <Card key={card.title} className="border-0 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {card.title}
                </span>
                <div className={`p-1.5 rounded-lg ${accentBg[color]}`}>
                  <card.icon className={`h-3.5 w-3.5 ${accentColors[color]}`} />
                </div>
              </div>
              <div className={`text-2xl font-bold tracking-tight ${accentColors[color]}`}>
                {formatKpiValue(card.value, card.format)}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
