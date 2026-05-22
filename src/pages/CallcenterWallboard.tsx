/**
 * F2 — Wallboard call center (realtime, refetch ogni 30s).
 *
 * Mostra:
 *  - KPI giornalieri aggregati (totale, risposte, perse, talk time, AHT)
 *  - Tabella per-operatore (RPC `get_operator_kpis`)
 *
 * Route: /callcenter/wallboard
 * Accesso: admin, ceo, responsabile_callcenter
 *
 * Realtime: poll-based (30s) per evitare cost di subscription su tabelle large.
 * In futuro F5 può convertire a `useGlobalRealtime` su `call_logs`.
 */
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, PhoneIncoming, PhoneOutgoing, PhoneOff, PhoneCall, Timer, Activity } from "lucide-react";
import { useBrand } from "@/contexts/BrandContext";
import { useOperatorKpis } from "@/hooks/useOperatorKpis";

function fmtDuration(seconds: number | null | undefined) {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}
function fmtNum(n: number | null | undefined) {
  if (n == null) return "—";
  return Number(n).toLocaleString("it-IT");
}

export default function CallcenterWallboard() {
  const { currentBrand, hasBrandSelected, isAllBrandsSelected } = useBrand();

  // Today range (local timezone, ISO for RPC)
  const { fromIso, toIso } = useMemo(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    return { fromIso: start.toISOString(), toIso: end.toISOString() };
  }, []);

  const { data: operators, isLoading, error } = useOperatorKpis(fromIso, toIso);

  // Daily totals (aggregati lato client dalla risposta operator KPIs)
  const totals = useMemo(() => {
    const list = operators ?? [];
    const sum = (k: keyof typeof list[number]) =>
      list.reduce((s, r) => s + Number(r[k] ?? 0), 0);
    const totalCalls = sum("calls_total");
    const totalTalk = sum("talk_time_seconds");
    const totalAnswered = sum("calls_answered");
    return {
      total: totalCalls,
      inbound: sum("calls_inbound"),
      outbound: sum("calls_outbound"),
      answered: totalAnswered,
      missed: sum("calls_missed"),
      talk: totalTalk,
      aht: totalAnswered > 0 ? Math.round(totalTalk / totalAnswered) : null,
    };
  }, [operators]);

  if (!hasBrandSelected || isAllBrandsSelected) {
    return (
      <div className="container mx-auto p-6">
        <h1 className="text-3xl font-bold mb-4">Wallboard call center</h1>
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Seleziona un brand specifico (non "Azienda Intera") per visualizzare il wallboard.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Wallboard call center</h1>
          <p className="text-muted-foreground mt-1">
            Brand <strong>{currentBrand?.name}</strong> · Oggi · Aggiornamento ogni 30s
          </p>
        </div>
        <Badge variant="outline" className="gap-1">
          <Activity className="w-3 h-3 text-emerald-500" /> Live
        </Badge>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KpiTile icon={<PhoneCall className="w-4 h-4" />} label="Chiamate" value={fmtNum(totals.total)} />
        <KpiTile icon={<PhoneIncoming className="w-4 h-4" />} label="In entrata" value={fmtNum(totals.inbound)} />
        <KpiTile icon={<PhoneOutgoing className="w-4 h-4" />} label="In uscita" value={fmtNum(totals.outbound)} />
        <KpiTile icon={<PhoneCall className="w-4 h-4 text-emerald-500" />} label="Risposte" value={fmtNum(totals.answered)} />
        <KpiTile icon={<PhoneOff className="w-4 h-4 text-destructive" />} label="Perse" value={fmtNum(totals.missed)} />
        <KpiTile icon={<Timer className="w-4 h-4" />} label="AHT medio" value={fmtDuration(totals.aht)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>KPI per operatore</CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{(error as Error).message}</AlertDescription>
            </Alert>
          ) : isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : !operators || operators.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Nessuna attività call center oggi.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Operatore</TableHead>
                    <TableHead className="text-right">Totali</TableHead>
                    <TableHead className="text-right">In entrata</TableHead>
                    <TableHead className="text-right">In uscita</TableHead>
                    <TableHead className="text-right">Risposte</TableHead>
                    <TableHead className="text-right">Perse</TableHead>
                    <TableHead className="text-right">Talk time</TableHead>
                    <TableHead className="text-right">AHT medio</TableHead>
                    <TableHead className="text-right">Resp. media</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {operators.map((op) => (
                    <TableRow key={op.user_id}>
                      <TableCell className="font-medium">{op.full_name}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(op.calls_total)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(op.calls_inbound)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(op.calls_outbound)}</TableCell>
                      <TableCell className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">{fmtNum(op.calls_answered)}</TableCell>
                      <TableCell className="text-right tabular-nums text-destructive">{fmtNum(op.calls_missed)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtDuration(op.talk_time_seconds)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtDuration(op.avg_talk_seconds ? Math.round(op.avg_talk_seconds) : null)}</TableCell>
                      <TableCell className="text-right tabular-nums">{op.avg_response_seconds != null ? `${Math.round(op.avg_response_seconds)}s` : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          {icon}
          <span>{label}</span>
        </div>
        <div className="text-2xl font-semibold mt-2 tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}
