import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Ga4DayStat } from "@/hooks/useGa4Stats";

interface Ga4CampaignsTableProps {
  stats: Ga4DayStat[];
  isLoading: boolean;
}

export function Ga4CampaignsTable({ stats, isLoading }: Ga4CampaignsTableProps) {
  // Aggregate campaigns across all days
  const campMap: Record<string, { sessions: number; conversions: number }> = {};
  for (const day of stats) {
    for (const c of day.top_campaigns || []) {
      if (!c.campaign || c.campaign === "(not set)") continue;
      if (!campMap[c.campaign]) {
        campMap[c.campaign] = { sessions: 0, conversions: 0 };
      }
      campMap[c.campaign].sessions += c.sessions;
      campMap[c.campaign].conversions += c.conversions;
    }
  }

  const campaigns = Object.entries(campMap)
    .map(([campaign, data]) => ({
      campaign,
      ...data,
      convRate: data.sessions > 0 ? (data.conversions / data.sessions) * 100 : 0,
    }))
    .sort((a, b) => b.sessions - a.sessions);

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Campagne UTM</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-20 flex items-center justify-center text-muted-foreground">
            Caricamento...
          </div>
        ) : campaigns.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Nessun dato campagne UTM disponibile
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 font-medium text-muted-foreground">Campagna</th>
                  <th className="text-right py-2 font-medium text-muted-foreground">Sessioni</th>
                  <th className="text-right py-2 font-medium text-muted-foreground">Conversioni</th>
                  <th className="text-right py-2 font-medium text-muted-foreground">Conv. Rate</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.campaign} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="py-2.5 font-medium truncate max-w-[300px]">{c.campaign}</td>
                    <td className="py-2.5 text-right">{c.sessions.toLocaleString("it-IT")}</td>
                    <td className="py-2.5 text-right">{c.conversions.toLocaleString("it-IT")}</td>
                    <td className="py-2.5 text-right">{c.convRate.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
