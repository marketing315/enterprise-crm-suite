import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, Users, TrendingUp, Target } from "lucide-react";
import type { MarketingCampaignKpi } from "@/types/marketing";

interface CampaignKpiCardsProps {
  kpis: MarketingCampaignKpi[] | undefined;
  isLoading: boolean;
}

export function CampaignKpiCards({ kpis, isLoading }: CampaignKpiCardsProps) {
  const totals = (kpis ?? []).reduce(
    (acc, k) => ({
      spend: acc.spend + (k.marketing_cost ?? 0),
      leads: acc.leads + (k.leads_count ?? 0),
      revenue: acc.revenue + (k.revenue ?? 0),
      dealsWon: acc.dealsWon + (k.deals_won ?? 0),
    }),
    { spend: 0, leads: 0, revenue: 0, dealsWon: 0 }
  );

  const avgCpl = totals.leads > 0 ? totals.spend / totals.leads : null;
  const roas = totals.spend > 0 ? totals.revenue / totals.spend : null;

  const cards = [
    {
      label: "Spesa ADV Totale",
      value: `€${totals.spend.toLocaleString("it-IT", { minimumFractionDigits: 2 })}`,
      icon: DollarSign,
      color: "text-orange-600",
    },
    {
      label: "Lead Totali",
      value: totals.leads.toLocaleString("it-IT"),
      icon: Users,
      color: "text-blue-600",
    },
    {
      label: "CPL Medio",
      value: avgCpl != null ? `€${avgCpl.toFixed(2)}` : "—",
      icon: Target,
      color: "text-purple-600",
    },
    {
      label: "ROAS",
      value: roas != null ? `${roas.toFixed(2)}x` : "—",
      icon: TrendingUp,
      color: roas != null && roas >= 1 ? "text-green-600" : "text-red-600",
    },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="pt-4">
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-8 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <c.icon className={`h-4 w-4 ${c.color}`} />
              {c.label}
            </div>
            <div className="text-2xl font-bold">{c.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
