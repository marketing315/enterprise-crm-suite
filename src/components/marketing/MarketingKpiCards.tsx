import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Users, DollarSign, Target, Percent } from "lucide-react";
import type { MarketingSummaryKpi } from "@/types/marketing";

interface MarketingKpiCardsProps {
  kpis: MarketingSummaryKpi | null;
  isLoading?: boolean;
}

export function MarketingKpiCards({ kpis, isLoading }: MarketingKpiCardsProps) {
  const cards = [
    {
      title: "Lead Totali",
      value: kpis?.total_leads ?? 0,
      icon: Users,
      format: "number",
    },
    {
      title: "Costo Marketing",
      value: kpis?.total_marketing_cost ?? 0,
      icon: DollarSign,
      format: "currency",
    },
    {
      title: "Ricavi Generati",
      value: kpis?.total_revenue ?? 0,
      icon: TrendingUp,
      format: "currency",
    },
    {
      title: "ROI",
      value: kpis?.overall_roi ?? 0,
      icon: kpis && kpis.overall_roi >= 0 ? TrendingUp : TrendingDown,
      format: "percent",
      colorClass: kpis && kpis.overall_roi >= 0 ? "text-green-600" : "text-red-600",
    },
    {
      title: "CPL Medio",
      value: kpis?.avg_cpl ?? 0,
      icon: Target,
      format: "currency",
    },
    {
      title: "CAC Medio",
      value: kpis?.avg_cac ?? 0,
      icon: Percent,
      format: "currency",
    },
  ];

  const formatValue = (value: number, format: string) => {
    if (format === "currency") {
      return `€${value.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (format === "percent") {
      return `${value.toFixed(1)}%`;
    }
    return value.toLocaleString("it-IT");
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {cards.map((card, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-8 bg-muted animate-pulse rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {card.title}
            </CardTitle>
            <card.icon className={`h-4 w-4 ${card.colorClass || "text-muted-foreground"}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${card.colorClass || ""}`}>
              {formatValue(card.value, card.format)}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
