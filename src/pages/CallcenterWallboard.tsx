/**
 * F2 — Wallboard call center (realtime, intervallo refresh configurabile).
 *
 * Mostra:
 *  - Selettore intervallo date (Oggi / 7g / 30g / Custom) + refresh interval
 *  - KPI aggregati per il periodo (totale, in entrata, in uscita, risposte, perse, AHT)
 *  - Breakdown per canale marketing (channel_name dei tracking number)
 *  - Tabella per-operatore (RPC `get_operator_kpis`)
 *
 * Route: /callcenter/wallboard
 * Accesso: admin, ceo, responsabile_callcenter
 */
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { AlertCircle, PhoneIncoming, PhoneOutgoing, PhoneOff, PhoneCall, Timer, Activity, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBrand } from "@/contexts/BrandContext";
import { useOperatorKpis } from "@/hooks/useOperatorKpis";
import { useTrackingNumberPerformance } from "@/hooks/useTrackingNumberPerformance";

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

type RangePreset = "today" | "7d" | "30d" | "custom";

function computeRange(preset: RangePreset, customFrom?: Date, customTo?: Date) {
  const end = new Date(); end.setHours(0, 0, 0, 0); end.setDate(end.getDate() + 1);
  const start = new Date(end);
  if (preset === "today") start.setDate(end.getDate() - 1);
  else if (preset === "7d") start.setDate(end.getDate() - 7);
  else if (preset === "30d") start.setDate(end.getDate() - 30);
  else if (preset === "custom" && customFrom && customTo) {
    const s = new Date(customFrom); s.setHours(0, 0, 0, 0);
    const e = new Date(customTo); e.setHours(0, 0, 0, 0); e.setDate(e.getDate() + 1);
    return { fromIso: s.toISOString(), toIso: e.toISOString() };
  }
  return { fromIso: start.toISOString(), toIso: end.toISOString() };
}

const REFRESH_OPTIONS: { label: string; value: string; ms: number | false }[] = [
  { label: "Off", value: "off", ms: false },
  { label: "15s", value: "15", ms: 15_000 },
  { label: "30s", value: "30", ms: 30_000 },
  { label: "60s", value: "60", ms: 60_000 },
  { label: "5min", value: "300", ms: 300_000 },
];

export default function CallcenterWallboard() {
  const { currentBrand, hasBrandSelected, isAllBrandsSelected } = useBrand();

  const [preset, setPreset] = useState<RangePreset>("today");
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [refreshKey, setRefreshKey] = useState("30");

  const refreshMs = useMemo(
    () => REFRESH_OPTIONS.find((o) => o.value === refreshKey)?.ms ?? false,
    [refreshKey],
  );

  const { fromIso, toIso } = useMemo(
    () => computeRange(preset, customFrom, customTo),
    [preset, customFrom, customTo],
  );

  const { data: operators, isLoading, error, isFetching, refetch } = useOperatorKpis(fromIso, toIso, refreshMs);
  const { data: channels, isLoading: chLoading } = useTrackingNumberPerformance(fromIso, toIso, refreshMs);

  // Totali aggregati
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

  // Breakdown per canale marketing
  const byChannel = useMemo(() => {
    const map = new Map<string, { calls_in: number; answered: number; talk: number; numbers: number }>();
    for (const c of channels ?? []) {
      const key = c.channel_name || "(senza canale)";
      const prev = map.get(key) ?? { calls_in: 0, answered: 0, talk: 0, numbers: 0 };
      prev.calls_in += Number(c.calls_in ?? 0);
      prev.answered += Number(c.calls_answered ?? 0);
      prev.talk += Number(c.talk_time_seconds ?? 0);
      prev.numbers += 1;
      map.set(key, prev);
    }
    return Array.from(map.entries())
      .map(([channel, v]) => ({
        channel,
        ...v,
        answer_rate: v.calls_in > 0 ? v.answered / v.calls_in : null,
      }))
      .sort((a, b) => b.calls_in - a.calls_in);
  }, [channels]);

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

  const rangeLabel = preset === "today" ? "Oggi"
    : preset === "7d" ? "Ultimi 7 giorni"
    : preset === "30d" ? "Ultimi 30 giorni"
    : (customFrom && customTo
        ? `${format(customFrom, "dd MMM", { locale: it })} → ${format(customTo, "dd MMM", { locale: it })}`
        : "Custom");

  return (
    <div className="container mx-auto p-6 space-y-6">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Wallboard call center</h1>
          <p className="text-muted-foreground mt-1">
            Brand <strong>{currentBrand?.name}</strong> · {rangeLabel} ·{" "}
            {refreshMs === false ? "refresh manuale" : `aggiornamento ogni ${(refreshMs as number) / 1000}s`}
          </p>
        </div>
        <Badge variant="outline" className="gap-1">
          <Activity className={cn("w-3 h-3", refreshMs === false ? "text-muted-foreground" : "text-emerald-500")} />
          {refreshMs === false ? "Paused" : "Live"}
        </Badge>
      </header>

      {/* Controls: range + custom + refresh */}
      <Card>
        <CardContent className="pt-6 flex flex-wrap items-center gap-3">
          <ToggleGroup
            type="single"
            value={preset}
            onValueChange={(v) => v && setPreset(v as RangePreset)}
            variant="outline"
            size="sm"
          >
            <ToggleGroupItem value="today">Oggi</ToggleGroupItem>
            <ToggleGroupItem value="7d">7g</ToggleGroupItem>
            <ToggleGroupItem value="30d">30g</ToggleGroupItem>
            <ToggleGroupItem value="custom">Custom</ToggleGroupItem>
          </ToggleGroup>

          {preset === "custom" && (
            <>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn(!customFrom && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {customFrom ? format(customFrom, "dd MMM yyyy", { locale: it }) : "Da"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={customFrom} onSelect={setCustomFrom} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn(!customTo && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {customTo ? format(customTo, "dd MMM yyyy", { locale: it }) : "A"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={customTo} onSelect={setCustomTo} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </>
          )}

          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Refresh</span>
            <Select value={refreshKey} onValueChange={setRefreshKey}>
              <SelectTrigger className="w-[110px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {REFRESH_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* KPI globali */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KpiTile icon={<PhoneCall className="w-4 h-4" />} label="Chiamate" value={fmtNum(totals.total)} />
        <KpiTile icon={<PhoneIncoming className="w-4 h-4" />} label="In entrata" value={fmtNum(totals.inbound)} />
        <KpiTile icon={<PhoneOutgoing className="w-4 h-4" />} label="In uscita" value={fmtNum(totals.outbound)} />
        <KpiTile icon={<PhoneCall className="w-4 h-4 text-emerald-500" />} label="Risposte" value={fmtNum(totals.answered)} />
        <KpiTile icon={<PhoneOff className="w-4 h-4 text-destructive" />} label="Perse" value={fmtNum(totals.missed)} />
        <KpiTile icon={<Timer className="w-4 h-4" />} label="AHT medio" value={fmtDuration(totals.aht)} />
      </div>

      {/* Per canale marketing */}
      <Card>
        <CardHeader>
          <CardTitle>Chiamate inbound per canale</CardTitle>
        </CardHeader>
        <CardContent>
          {chLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : byChannel.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Nessuna chiamata inbound nel periodo selezionato.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Canale</TableHead>
                    <TableHead className="text-right">Numeri attivi</TableHead>
                    <TableHead className="text-right">Chiamate inbound</TableHead>
                    <TableHead className="text-right">Risposte</TableHead>
                    <TableHead className="text-right">Answer rate</TableHead>
                    <TableHead className="text-right">Talk time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byChannel.map((row) => (
                    <TableRow key={row.channel}>
                      <TableCell className="font-medium">{row.channel}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(row.numbers)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(row.calls_in)}</TableCell>
                      <TableCell className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">{fmtNum(row.answered)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.answer_rate != null ? `${(row.answer_rate * 100).toFixed(1)}%` : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmtDuration(row.talk)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Per operatore */}
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
              Nessuna attività call center nel periodo selezionato.
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
