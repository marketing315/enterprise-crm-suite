import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Ga4DayStat } from "@/hooks/useGa4Stats";

interface Ga4PagesTableProps {
  stats: Ga4DayStat[];
  isLoading: boolean;
}

export function Ga4PagesTable({ stats, isLoading }: Ga4PagesTableProps) {
  // Aggregate pages across all days
  const pageMap: Record<string, number> = {};
  for (const day of stats) {
    for (const p of day.top_pages || []) {
      pageMap[p.page] = (pageMap[p.page] || 0) + p.views;
    }
  }

  const pages = Object.entries(pageMap)
    .map(([page, views]) => ({ page, views }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 10);

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Top 10 Pagine</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-20 flex items-center justify-center text-muted-foreground">
            Caricamento...
          </div>
        ) : pages.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Nessun dato disponibile
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 font-medium text-muted-foreground">Pagina</th>
                  <th className="text-right py-2 font-medium text-muted-foreground">Visualizzazioni</th>
                </tr>
              </thead>
              <tbody>
                {pages.map((p) => (
                  <tr key={p.page} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="py-2.5 font-mono text-xs truncate max-w-[400px]">{p.page}</td>
                    <td className="py-2.5 text-right">{p.views.toLocaleString("it-IT")}</td>
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
