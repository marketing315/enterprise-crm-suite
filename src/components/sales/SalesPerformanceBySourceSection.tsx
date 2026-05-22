/**
 * F5.3 — Sezione "Per fonte" nel foglio venditori.
 * Mostra breakdown vendite per fonte (categoria + canale) con prezzo medio.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Layers, AlertCircle } from "lucide-react";
import { useSalesPerformanceBySource } from "@/hooks/useSalesPerformanceBySource";

function fmtEur(n: number | null | undefined) {
  if (n == null) return "—";
  return `€ ${Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtNum(n: number | null | undefined) {
  if (n == null) return "—";
  return Number(n).toLocaleString("it-IT");
}
function fmtPct(n: number | null | undefined) {
  if (n == null) return "—";
  return `${Number(n).toFixed(1)}%`;
}

export function SalesPerformanceBySourceSection({
  brandId,
  from,
  to,
}: {
  brandId: string;
  from: Date;
  to: Date;
}) {
  const q = useSalesPerformanceBySource(brandId, from, to);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Layers className="h-4 w-4" /> Performance per fonte
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {q.isLoading && (
          <div className="p-4 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
          </div>
        )}
        {q.error && (
          <Alert variant="destructive" className="m-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{(q.error as Error).message}</AlertDescription>
          </Alert>
        )}
        {!q.isLoading && (q.data?.length ?? 0) === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Nessun dato disponibile per il periodo selezionato.
          </div>
        )}
        {q.data && q.data.length > 0 && (
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Canale</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">Visitati</TableHead>
                  <TableHead className="text-right">Ord.</TableHead>
                  <TableHead className="text-right">% Vend.</TableHead>
                  <TableHead className="text-right">Lordo</TableHead>
                  <TableHead className="text-right">Prezzo medio</TableHead>
                  <TableHead className="text-right">Cons.</TableHead>
                  <TableHead className="text-right">% Cons.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.data.map((r, idx) => (
                  <TableRow key={`${r.source_category}-${r.channel_id ?? "none"}-${idx}`}>
                    <TableCell>
                      <Badge variant="outline" className="uppercase text-xs">
                        {r.source_category}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">
                      {r.channel_name ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmtNum(r.leads_count)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtNum(r.appts_eseguiti)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtNum(r.ordini_venduti)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtPct(r.perc_vendita)}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{fmtEur(r.lordo)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtEur(r.prezzo_medio)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtNum(r.consegnati)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtPct(r.perc_consegne)}</TableCell>
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
