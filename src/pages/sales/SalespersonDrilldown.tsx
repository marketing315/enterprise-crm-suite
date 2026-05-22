/**
 * F5.4 — Drill-down singolo venditore.
 * Route: /sales/performance-sheet/:userId
 *
 * Funnel periodo: assegnati → visitati → ordini → consegnati
 * Trend mensile 12 mesi (lordo + ordini + consegnati).
 */
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, AlertCircle, TrendingDown, TrendingUp, Target, Award } from "lucide-react";
import { startOfMonth, endOfMonth, subMonths, format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  Legend,
} from "recharts";
import { useBrand } from "@/contexts/BrandContext";
import { useSalespersonFunnel } from "@/hooks/useSalespersonFunnel";
import { useSalespersonKpisV2 } from "@/hooks/useSalespersonKpisV2";
import { MvFreshnessBadge } from "@/components/shared/MvFreshnessBadge";

type Period = "this_month" | "last_month" | "last_30d" | "ytd";

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

function resolveRange(p: Period): { from: Date; to: Date } {
  const now = new Date();
  if (p === "this_month") return { from: startOfMonth(now), to: endOfMonth(now) };
  if (p === "last_month") {
    const lm = subMonths(now, 1);
    return { from: startOfMonth(lm), to: endOfMonth(lm) };
  }
  if (p === "last_30d") return { from: new Date(now.getTime() - 30 * 86400_000), to: now };
  return { from: new Date(now.getFullYear(), 0, 1), to: now };
}

export default function SalespersonDrilldown() {
  const { userId } = useParams<{ userId: string }>();
  const { currentBrand } = useBrand();
  const activeBrandId = currentBrand?.id ?? null;

  const [period, setPeriod] = useState<Period>("this_month");
  const { from, to } = useMemo(() => resolveRange(period), [period]);

  const funnelQ = useSalespersonFunnel(activeBrandId, userId ?? null, from, to);
  // Per il nome venditore riusiamo la RPC v2 filtrata
  const kpisQ = useSalespersonKpisV2(activeBrandId, from, to);
  const seller = useMemo(() => (kpisQ.data?.rows ?? []).find((r) => r.user_id === userId), [kpisQ.data, userId]);

  if (!activeBrandId || !userId) {
    return (
      <div className="container mx-auto py-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Brand o venditore non specificato.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const f = funnelQ.data?.funnel;
  const trend = funnelQ.data?.trend ?? [];

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="space-y-1">
          <Button variant="ghost" size="sm" asChild className="-ml-2 mb-1">
            <Link to="/sales/performance-sheet"><ArrowLeft className="h-4 w-4 mr-1" /> Foglio venditori</Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">
            {seller?.full_name ?? seller?.email ?? "Venditore"}
          </h1>
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <span>Drill-down funnel · {format(from, "dd/MM/yyyy")} → {format(to, "dd/MM/yyyy")}</span>
            <MvFreshnessBadge mvName="mv_salesperson_perf_daily" />
          </p>
        </div>
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="this_month">Mese corrente</SelectItem>
            <SelectItem value="last_month">Mese scorso</SelectItem>
            <SelectItem value="last_30d">Ultimi 30 giorni</SelectItem>
            <SelectItem value="ytd">Year-to-date</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {funnelQ.error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{(funnelQ.error as Error).message}</AlertDescription>
        </Alert>
      )}

      {/* Funnel */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4" /> Funnel del periodo
          </CardTitle>
        </CardHeader>
        <CardContent>
          {funnelQ.isLoading || !f ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <FunnelStep
                label="Assegnati"
                value={fmtNum(f.assegnati)}
                hint="Appuntamenti programmati"
              />
              <FunnelStep
                label="Visitati"
                value={fmtNum(f.visitati)}
                hint={`Conversione: ${fmtPct(f.perc_visita)}`}
                trend={f.perc_visita}
              />
              <FunnelStep
                label="Ordini"
                value={fmtNum(f.ordini)}
                hint={`% vendita: ${fmtPct(f.perc_vendita)}`}
                trend={f.perc_vendita}
              />
              <FunnelStep
                label="Consegnati"
                value={fmtNum(f.consegnati)}
                hint={`% consegna: ${fmtPct(f.perc_consegna)} · Lordo: ${fmtEur(f.lordo)}`}
                trend={f.perc_consegna}
                accent
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Trend mensile */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Award className="h-4 w-4" /> Trend ultimi 12 mesi
          </CardTitle>
        </CardHeader>
        <CardContent>
          {funnelQ.isLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : trend.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Nessun dato negli ultimi 12 mesi.</div>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend.map((t) => ({
                  mese: format(parseISO(t.mese), "MMM yy", { locale: it }),
                  Assegnati: t.assegnati,
                  Visitati: t.visitati,
                  Ordini: t.ordini,
                  Consegnati: t.consegnati,
                  Lordo: Number(t.lordo),
                }))}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="mese" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <RTooltip
                    formatter={(v: number, name: string) => name === "Lordo" ? fmtEur(v) : fmtNum(v)}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Assegnati"  fill="hsl(var(--muted-foreground))" />
                  <Bar dataKey="Visitati"   fill="hsl(var(--primary))" />
                  <Bar dataKey="Ordini"     fill="hsl(var(--accent))" />
                  <Bar dataKey="Consegnati" fill="hsl(var(--ring))" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FunnelStep({
  label, value, hint, trend, accent,
}: {
  label: string;
  value: string;
  hint?: string;
  trend?: number;
  accent?: boolean;
}) {
  return (
    <Card className={accent ? "border-primary/40 bg-primary/5" : ""}>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold tabular-nums mt-1 flex items-center gap-2">
          {value}
          {trend != null && trend > 0 && <TrendingUp className="h-4 w-4 text-emerald-600" />}
          {trend != null && trend === 0 && <TrendingDown className="h-4 w-4 text-muted-foreground" />}
        </div>
        {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
}
