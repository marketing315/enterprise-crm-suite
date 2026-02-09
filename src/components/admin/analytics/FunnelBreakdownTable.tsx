import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FunnelBreakdown } from "@/hooks/useFunnelMetrics";
import { BarChart3 } from "lucide-react";

interface FunnelBreakdownTableProps {
  data?: FunnelBreakdown;
  isLoading?: boolean;
}

function formatN(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export function FunnelBreakdownTable({ data, isLoading }: FunnelBreakdownTableProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Breakdown per Campagna</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-10 bg-muted animate-pulse rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const campaigns = data?.by_campaign ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          Breakdown per Campagna
        </CardTitle>
        <CardDescription>
          Performance funnel per campagna marketing
        </CardDescription>
      </CardHeader>
      <CardContent>
        {campaigns.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nessuna campagna trovata nel periodo
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campagna</TableHead>
                  <TableHead className="text-right">Impr.</TableHead>
                  <TableHead className="text-right">Click</TableHead>
                  <TableHead className="text-right">Lead</TableHead>
                  <TableHead className="text-right">App.</TableHead>
                  <TableHead className="text-right">Vendite</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map(c => (
                  <TableRow key={c.campaign_id}>
                    <TableCell className="font-medium max-w-[200px] truncate">
                      {c.campaign_name || "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatN(c.impressions)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatN(c.clicks)}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.leads}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.appointments}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{c.sales}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      €{formatN(c.revenue)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
