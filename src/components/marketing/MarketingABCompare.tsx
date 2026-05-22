/**
 * F5.2 — Confronto A/B fonti su MarketingPerformance.
 * Mostra due colonne KPI + diff (Δ assoluto + Δ%) per due filtri fonte differenti.
 */
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowRightLeft, AlertCircle, TrendingUp, TrendingDown } from "lucide-react";
import {
  SourceFilterBar,
  type SourceFilter,
} from "@/components/shared/SourceFilterBar";
import { useChannelPerformance } from "@/hooks/useChannelPerformance";

function fmtEur(n: number | null | undefined): string {
  if (n == null) return "—";
  return `€ ${n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtNum(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("it-IT");
}
function fmtPct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function aggregate(rows: ReturnType<typeof useChannelPerformance>["data"]) {
  const list = rows ?? [];
  const leads = list.reduce((s, r) => s + (r.leads_count ?? 0), 0);
  const spend = list.reduce((s, r) => s + Number(r.spend ?? 0), 0);
  const won = list.reduce((s, r) => s + (r.deals_won ?? 0), 0);
  const revenue = list.reduce((s, r) => s + Number(r.revenue ?? 0), 0);
  return {
    leads,
    spend,
    won,
    revenue,
    cpl: leads > 0 ? spend / leads : null,
    cac: won > 0 ? spend / won : null,
    roi: spend > 0 ? (revenue - spend) / spend : null,
  };
}

function diff(a: number, b: number): { abs: number; pct: number | null } {
  return { abs: a - b, pct: b !== 0 ? (a - b) / Math.abs(b) : null };
}

export function MarketingABCompare({ range }: { range: { from: string; to: string } }) {
  const [enabled, setEnabled] = useState(false);
  const [filterA, setFilterA] = useState<SourceFilter>({});
  const [filterB, setFilterB] = useState<SourceFilter>({});

  const qA = useChannelPerformance({ from: range.from, to: range.to, sourceFilter: filterA });
  const qB = useChannelPerformance({ from: range.from, to: range.to, sourceFilter: filterB });

  const totA = useMemo(() => aggregate(qA.data), [qA.data]);
  const totB = useMemo(() => aggregate(qB.data), [qB.data]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ArrowRightLeft className="h-4 w-4" /> Confronto A / B fonti
        </CardTitle>
        <div className="flex items-center gap-2">
          <Label htmlFor="ab-toggle" className="text-xs text-muted-foreground">Abilita</Label>
          <Switch id="ab-toggle" checked={enabled} onCheckedChange={setEnabled} />
        </div>
      </CardHeader>
      {enabled && (
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">Variante A</div>
              <SourceFilterBar value={filterA} onChange={setFilterA} hidePeriod />
            </div>
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">Variante B</div>
              <SourceFilterBar value={filterB} onChange={setFilterB} hidePeriod />
            </div>
          </div>

          {(qA.error || qB.error) && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{(qA.error || qB.error) instanceof Error ? (qA.error || qB.error)!.message : "Errore caricamento"}</AlertDescription>
            </Alert>
          )}

          {(qA.isLoading || qB.isLoading) ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground border-b">
                  <tr>
                    <th className="text-left py-2 pr-2">Metrica</th>
                    <th className="text-right py-2 px-2">A</th>
                    <th className="text-right py-2 px-2">B</th>
                    <th className="text-right py-2 px-2">Δ</th>
                    <th className="text-right py-2 pl-2">Δ%</th>
                  </tr>
                </thead>
                <tbody>
                  <Row label="Leads"     a={fmtNum(totA.leads)}   b={fmtNum(totB.leads)}   d={diff(totA.leads, totB.leads)} />
                  <Row label="Spesa"     a={fmtEur(totA.spend)}   b={fmtEur(totB.spend)}   d={diff(totA.spend, totB.spend)} eur />
                  <Row label="CPL"       a={fmtEur(totA.cpl)}     b={fmtEur(totB.cpl)}     d={diff(totA.cpl ?? 0, totB.cpl ?? 0)} eur invert />
                  <Row label="Deals won" a={fmtNum(totA.won)}     b={fmtNum(totB.won)}     d={diff(totA.won, totB.won)} />
                  <Row label="Fatturato" a={fmtEur(totA.revenue)} b={fmtEur(totB.revenue)} d={diff(totA.revenue, totB.revenue)} eur />
                  <Row label="CAC"       a={fmtEur(totA.cac)}     b={fmtEur(totB.cac)}     d={diff(totA.cac ?? 0, totB.cac ?? 0)} eur invert />
                  <Row label="ROI"       a={fmtPct(totA.roi)}     b={fmtPct(totB.roi)}     d={diff(totA.roi ?? 0, totB.roi ?? 0)} pct />
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function Row({
  label, a, b, d, eur, pct, invert,
}: {
  label: string;
  a: string;
  b: string;
  d: { abs: number; pct: number | null };
  eur?: boolean;
  pct?: boolean;
  invert?: boolean;
}) {
  const positive = invert ? d.abs < 0 : d.abs > 0;
  const negative = invert ? d.abs > 0 : d.abs < 0;
  const cls = positive ? "text-emerald-600 dark:text-emerald-400" : negative ? "text-destructive" : "text-muted-foreground";
  const absFmt = eur
    ? `${d.abs >= 0 ? "+" : ""}${d.abs.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
    : pct
      ? `${d.abs >= 0 ? "+" : ""}${(d.abs * 100).toFixed(1)} pp`
      : `${d.abs >= 0 ? "+" : ""}${d.abs.toLocaleString("it-IT")}`;
  return (
    <tr className="border-b last:border-0">
      <td className="py-2 pr-2 font-medium">{label}</td>
      <td className="py-2 px-2 text-right tabular-nums">{a}</td>
      <td className="py-2 px-2 text-right tabular-nums">{b}</td>
      <td className={`py-2 px-2 text-right tabular-nums ${cls}`}>
        <span className="inline-flex items-center gap-1 justify-end">
          {positive && <TrendingUp className="h-3 w-3" />}
          {negative && <TrendingDown className="h-3 w-3" />}
          {absFmt}
        </span>
      </td>
      <td className={`py-2 pl-2 text-right tabular-nums ${cls}`}>
        {d.pct == null ? "—" : `${d.pct >= 0 ? "+" : ""}${(d.pct * 100).toFixed(1)}%`}
      </td>
    </tr>
  );
}
