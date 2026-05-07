import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Layers } from "lucide-react";
import { useAdAdsetStats } from "@/hooks/useAdAdsetStats";
import type { AdPlatform } from "@/types/adPlatform";

interface Props {
  fromDate: string;
  toDate: string;
  platform: AdPlatform | null;
  campaignExternalId: string | null;
  campaignLabel?: string | null;
}

const fmtEur = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(n));
const fmtNum = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("it-IT").format(Number(n));

export function AdsetStatsTable({ fromDate, toDate, platform, campaignExternalId, campaignLabel }: Props) {
  const { data, isLoading } = useAdAdsetStats({ fromDate, toDate, platform, campaignExternalId });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Layers className="h-4 w-4" />
          Gruppi di inserzioni
          {campaignLabel && (
            <span className="text-sm font-normal text-muted-foreground">— {campaignLabel}</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!campaignExternalId ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Seleziona una campagna nel filtro qui sopra per vedere i suoi gruppi di inserzioni.
          </p>
        ) : isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : !data?.length ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Nessun gruppo di inserzioni con dati nel periodo selezionato.
            <br />
            <span className="text-xs">Esegui una sync Meta per popolare i dati a livello adset.</span>
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Gruppo inserzioni</TableHead>
                  <TableHead className="text-right">Spesa</TableHead>
                  <TableHead className="text-right">Impressioni</TableHead>
                  <TableHead className="text-right">Click</TableHead>
                  <TableHead className="text-right">Reach</TableHead>
                  <TableHead className="text-right">Lead</TableHead>
                  <TableHead className="text-right">CPL</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((r) => (
                  <TableRow key={r.external_adset_id}>
                    <TableCell className="font-medium">
                      {r.external_adset_name || r.external_adset_id}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmtEur(r.total_spend)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtNum(r.total_impressions)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtNum(r.total_clicks)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtNum(r.total_reach)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtNum(r.total_leads)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtEur(r.cpl)}</TableCell>
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
