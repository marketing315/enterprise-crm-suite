/**
 * F2 — Tabella performance per numero verde, mostrata sotto la tabella canali
 * nella pagina /marketing/performance. Le colonne CPL/Spesa sono visibili
 * solo agli utenti con `has_finance_access` (server-side enforced).
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { AlertCircle } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTrackingNumberPerformance } from "@/hooks/useTrackingNumberPerformance";

function fmtEur(n: number | null | undefined) {
  if (n == null) return "—";
  return `€ ${Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtNum(n: number | null | undefined) {
  if (n == null) return "—";
  return Number(n).toLocaleString("it-IT");
}
function fmtDuration(seconds: number) {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

interface Props {
  from: string;
  to: string;
}

export function TrackingNumberPerformanceTable({ from, to }: Props) {
  const { data, isLoading, error } = useTrackingNumberPerformance(from, to);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Performance per numero verde</CardTitle>
      </CardHeader>
      <CardContent>
        {error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{(error as Error).message}</AlertDescription>
          </Alert>
        ) : isLoading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Nessun numero verde attivo o nessuna chiamata nel periodo.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Etichetta</TableHead>
                  <TableHead>Numero</TableHead>
                  <TableHead>Emittente</TableHead>
                  <TableHead>Canale</TableHead>
                  <TableHead className="text-right">Chiamate</TableHead>
                  <TableHead className="text-right">Risposte</TableHead>
                  <TableHead className="text-right">Contatti unici</TableHead>
                  <TableHead className="text-right">Talk time</TableHead>
                  <TableHead className="text-right">Spesa</TableHead>
                  <TableHead className="text-right">CPL stimato</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((r) => (
                  <TableRow key={r.tracking_number_id}>
                    <TableCell className="font-medium">{r.label}</TableCell>
                    <TableCell className="font-mono text-xs">{r.phone_e164}</TableCell>
                    <TableCell>
                      {r.broadcaster ? <Badge variant="outline">{r.broadcaster}</Badge> : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {r.channel_name ?? "—"}
                      {r.campaign_name ? ` · ${r.campaign_name}` : ""}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmtNum(r.calls_in)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtNum(r.calls_answered)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtNum(r.unique_contacts)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtDuration(r.talk_time_seconds)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtEur(r.spend)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtEur(r.est_cpl)}</TableCell>
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
