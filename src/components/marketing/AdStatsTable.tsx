import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AdPlatformStatAggregated } from "@/types/adPlatform";

interface AdStatsTableProps {
  data: AdPlatformStatAggregated[] | undefined;
  isLoading: boolean;
  showBrand?: boolean;
}

export function AdStatsTable({ data, isLoading, showBrand }: AdStatsTableProps) {
  const formatCurrency = (v: number) => `€${v.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formatNumber = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v.toString();
  const formatPercent = (v: number | null) => v !== null ? `${v.toFixed(2)}%` : "—";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Performance per Campagna</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !data?.length ? (
          <div className="text-center py-8 text-muted-foreground">
            Nessuna statistica importata per il periodo selezionato
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campagna</TableHead>
                  <TableHead>Piattaforma</TableHead>
                  <TableHead className="text-right">Spesa</TableHead>
                  <TableHead className="text-right">Impression</TableHead>
                  <TableHead className="text-right">Reach</TableHead>
                  <TableHead className="text-right">Freq.</TableHead>
                  <TableHead className="text-right">Click</TableHead>
                  <TableHead className="text-right">CTR</TableHead>
                  <TableHead className="text-right">CPC</TableHead>
                  <TableHead className="text-right">Giorni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row) => (
                  <TableRow key={`${row.platform}-${row.external_campaign_id}-${row.brand_id}`}>
                    <TableCell>
                      <div>
                        <div className="font-medium">
                          {row.campaign_name || row.external_campaign_name || "—"}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {row.platform}:{row.external_campaign_id}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {row.platform}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(row.total_spend)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatNumber(row.total_impressions)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatNumber(row.total_reach)}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.avg_frequency !== null ? row.avg_frequency.toFixed(2) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatNumber(row.total_clicks)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatPercent(row.ctr)}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.cpc !== null ? formatCurrency(row.cpc) : "—"}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {row.days_count}
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
