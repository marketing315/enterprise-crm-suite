import { Users, DollarSign, Trophy, Briefcase } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SalespersonKpi } from "@/hooks/useSalespersonKpis";

interface SalespersonKpiCardsProps {
  kpis: SalespersonKpi[];
  isLoading?: boolean;
}

export function SalespersonKpiCards({ kpis, isLoading }: SalespersonKpiCardsProps) {
  // Aggregate KPIs
  const totalSalespersons = kpis.length;
  const totalValueWon = kpis.reduce((sum, k) => sum + (k.total_value_won || 0), 0);
  const avgWinRate = totalSalespersons > 0
    ? kpis.reduce((sum, k) => sum + (k.win_rate || 0), 0) / totalSalespersons
    : 0;
  const totalDealsOpen = kpis.reduce((sum, k) => sum + (k.deals_open || 0), 0);

  const cards = [
    {
      title: "Venditori Attivi",
      value: totalSalespersons,
      icon: Users,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      title: "Valore Totale",
      value: `€${totalValueWon.toLocaleString("it-IT")}`,
      icon: DollarSign,
      color: "text-green-600",
      bgColor: "bg-green-100",
    },
    {
      title: "Win Rate Medio",
      value: `${avgWinRate.toFixed(1)}%`,
      icon: Trophy,
      color: "text-amber-600",
      bgColor: "bg-amber-100",
    },
    {
      title: "Deal Aperti",
      value: totalDealsOpen,
      icon: Briefcase,
      color: "text-blue-600",
      bgColor: "bg-blue-100",
    },
  ];

  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {card.title}
            </CardTitle>
            <div className={`p-2 rounded-lg ${card.bgColor}`}>
              <card.icon className={`h-4 w-4 ${card.color}`} />
            </div>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${isLoading ? "animate-pulse bg-muted h-8 w-20 rounded" : ""}`}>
              {!isLoading && card.value}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
