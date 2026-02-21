import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Target, TrendingUp, AlertTriangle, DollarSign } from "lucide-react";
import type { AttributionSummary } from "@/hooks/useCplAnalytics";

interface Props {
  data: AttributionSummary | null | undefined;
  isLoading: boolean;
}

export function CplKpiCards({ data, isLoading }: Props) {
  const cards = [
    {
      label: "Lead Attribuiti",
      value: data ? `${data.total_leads}` : "—",
      sub: data ? `${data.exact_count} exact · ${data.group_count} group` : "",
      icon: Target,
      color: "text-primary",
    },
    {
      label: "Match Rate",
      value: data ? `${data.match_rate}%` : "—",
      sub: data ? `${data.unmapped_count} unmapped` : "",
      icon: TrendingUp,
      color: data && data.match_rate < 50 ? "text-destructive" : "text-emerald-600",
    },
    {
      label: "CPL Effettivo",
      value: data ? `€${data.overall_cpl.toFixed(2)}` : "—",
      sub: "spend / lead attribuiti",
      icon: DollarSign,
      color: "text-primary",
    },
    {
      label: "Unmapped",
      value: data ? `${data.unmapped_count}` : "—",
      sub: "lead senza campagna",
      icon: AlertTriangle,
      color: data && data.unmapped_count > 0 ? "text-amber-600" : "text-muted-foreground",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardContent className="pt-4 pb-3 px-4">
            {isLoading ? (
              <Skeleton className="h-12 w-full" />
            ) : (
              <div className="flex items-start gap-3">
                <c.icon className={`h-5 w-5 mt-0.5 ${c.color}`} />
                <div>
                  <p className="text-xs text-muted-foreground">{c.label}</p>
                  <p className="text-xl font-bold">{c.value}</p>
                  {c.sub && (
                    <p className="text-xs text-muted-foreground">{c.sub}</p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
