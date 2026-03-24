import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Eye, Users, UserPlus, Timer, Target } from "lucide-react";
import type { Ga4Summary } from "@/hooks/useGa4Stats";

interface Ga4KpiCardsProps {
  summary: Ga4Summary;
  isLoading: boolean;
}

export function Ga4KpiCards({ summary, isLoading }: Ga4KpiCardsProps) {
  const kpis = [
    {
      title: "Sessioni",
      value: summary.sessions.toLocaleString("it-IT"),
      icon: Activity,
    },
    {
      title: "Utenti",
      value: summary.users.toLocaleString("it-IT"),
      icon: Users,
    },
    {
      title: "Nuovi Utenti",
      value: summary.new_users.toLocaleString("it-IT"),
      icon: UserPlus,
    },
    {
      title: "Bounce Rate",
      value: `${(summary.bounce_rate * 100).toFixed(1)}%`,
      icon: Eye,
    },
    {
      title: "Durata Media",
      value: `${Math.round(summary.avg_session_duration)}s`,
      icon: Timer,
    },
    {
      title: "Conversioni",
      value: summary.conversions.toLocaleString("it-IT"),
      icon: Target,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {kpis.map((kpi) => (
        <Card key={kpi.title} className="border-0 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">{kpi.title}</CardTitle>
            <kpi.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-7 bg-muted animate-pulse rounded" />
            ) : (
              <div className="text-xl font-bold">{kpi.value}</div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
