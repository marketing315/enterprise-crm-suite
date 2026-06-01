/**
 * F4 — Pagina "Vista Foglio" venditori (1:1 ESITO APPUNTAMENTI).
 * Route: /sales/performance-sheet
 *
 * Tabella riga-per-venditore con:
 * App. programmati / eseguiti / no-show / cancellati • % esecuzione
 * Ordini venduti • % vendita • Lordo € • Imponibile € (lordo/1.22)
 * Consegnati periodo • % consegne • Bonus tier applicato
 *
 * Footer: aggregato brand. Toolbar: periodo + admin tiers + export CSV.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, AlertCircle, TrendingUp, ChevronRight } from "lucide-react";
import { startOfMonth, endOfMonth, subMonths, format } from "date-fns";
import { useBrand } from "@/contexts/BrandContext";
import { useAuth } from "@/contexts/AuthContext";
import { useSalespersonKpisV2, useSalespersonKpisAggregate, useSalespersonKpisV2Ext, type TaxableMode } from "@/hooks/useSalespersonKpisV2";
import { SalesBonusTiersDialog } from "@/components/sales/SalesBonusTiersDialog";
import { SalesPerformanceBySourceSection } from "@/components/sales/SalesPerformanceBySourceSection";
import { MvFreshnessBadge } from "@/components/shared/MvFreshnessBadge";
import { PerfSheetExportDialog } from "@/components/sales/PerfSheetExportDialog";

type DeliveriesMode = "period" | "cohort";

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

import { useIsMobile } from "@/hooks/use-mobile";
import { lazyMobile } from "@/lib/lazyMobile";
const MobileSalesPerformanceSheet = lazyMobile(() =>
  import("@/components/sales/mobile/MobileSalesPerformanceSheet").then((m) => ({
    default: m.MobileSalesPerformanceSheet,
  })),
);

export default function SalesPerformanceSheet() {
  const isMobileViewport = useIsMobile();
  if (isMobileViewport) return <MobileSalesPerformanceSheet />;
  return <SalesPerformanceSheetDesktop />;
}

function SalesPerformanceSheetDesktop() {
  const { currentBrand } = useBrand();
  const activeBrandId = currentBrand?.id ?? null;
  const { isAdmin, isCeo, hasRole } = useAuth();
  const canManageTiers = isAdmin || isCeo || (!!activeBrandId && hasRole("responsabile_venditori", activeBrandId));

  const [period, setPeriod] = useState<Period>("this_month");
  const [deliveriesMode, setDeliveriesMode] = useState<DeliveriesMode>("period");
  const [taxableMode, setTaxableMode] = useState<TaxableMode>("effective");
  const { from, to } = useMemo(() => resolveRange(period), [period]);

  const kpisQ = useSalespersonKpisV2(activeBrandId, from, to);
  const aggQ = useSalespersonKpisAggregate(activeBrandId, from, to);
  const extQ = useSalespersonKpisV2Ext(activeBrandId, from, to, { taxableMode });
  const extByUser = useMemo(() => {
    const m = new Map<string, NonNullable<typeof extQ.data>["rows"][number]>();
    for (const r of extQ.data?.rows ?? []) m.set(r.user_id, r);
    return m;
  }, [extQ.data]);

  const rows = kpisQ.data?.rows ?? [];

  function exportCsv() {
    const header = [
      "Venditore","Email","Programmati","Eseguiti","No-show","Cancellati","% Esecuzione",
      "Ordini venduti","% Vendita","Lordo","Imponibile","Consegnati","% Consegne",
      "Tier","Bonus €",
    ];
    const lines = rows.map((r) => [
      r.full_name ?? "", r.email ?? "",
      r.appuntamenti_programmati, r.appuntamenti_eseguiti, r.no_show, r.cancellati, r.perc_esecuzione,
      r.ordini_venduti, r.perc_vendita,
      r.lordo, r.imponibile, r.consegnati_periodo, r.perc_consegne_periodo,
      r.bonus?.tier_label ?? "", r.bonus?.bonus_amount ?? 0,
    ].map((x) => `"${String(x).replace(/"/g, '""')}"`).join(","));
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `venditori-foglio-${format(from, "yyyyMMdd")}-${format(to, "yyyyMMdd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!activeBrandId) {
    return (
      <div className="container mx-auto py-6">
        <Alert><AlertCircle className="h-4 w-4" /><AlertDescription>Seleziona un brand per visualizzare il foglio venditori.</AlertDescription></Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Foglio venditori</h1>
          <p className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
            <span>Vista 1:1 ESITO APPUNTAMENTI · imponibile = lordo / 1,22 · {kpisQ.data?.calc_version ?? "v2.0"}</span>
            <MvFreshnessBadge mvName="mv_salesperson_perf_daily" />
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="this_month">Mese corrente</SelectItem>
              <SelectItem value="last_month">Mese scorso</SelectItem>
              <SelectItem value="last_30d">Ultimi 30 giorni</SelectItem>
              <SelectItem value="ytd">Year-to-date</SelectItem>
            </SelectContent>
          </Select>
          <Select value={deliveriesMode} onValueChange={(v) => setDeliveriesMode(v as DeliveriesMode)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="period">Consegne: Periodo</SelectItem>
              <SelectItem value="cohort">Consegne: Coorte (F5.8)</SelectItem>
            </SelectContent>
          </Select>
          <Select value={taxableMode} onValueChange={(v) => setTaxableMode(v as TaxableMode)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="effective">IVA: per riga + fallback</SelectItem>
              <SelectItem value="itemized">IVA: solo per riga</SelectItem>
              <SelectItem value="flat">IVA: flat 22%</SelectItem>
            </SelectContent>
          </Select>
          {canManageTiers && <SalesBonusTiersDialog brandId={activeBrandId} />}
          <PerfSheetExportDialog brandId={activeBrandId} canEdit={isAdmin || (!!activeBrandId && hasRole("admin", activeBrandId))} />
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length} className="gap-2">
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Aggregati */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="Lordo periodo" value={fmtEur(aggQ.data?.lordo)} />
        <KpiTile label={taxableMode === "flat" ? "Imponibile (flat 22%)" : taxableMode === "itemized" ? "Imponibile (per riga)" : "Imponibile (effettivo)"} value={fmtEur(aggQ.data?.imponibile)} />
        <KpiTile label="Ordini venduti" value={fmtNum(aggQ.data?.ordini_venduti)} />
        <KpiTile label="Bonus totale" value={fmtEur(aggQ.data?.bonus_totale)} />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Dettaglio per venditore</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {kpisQ.isLoading && <div className="p-4 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>}
          {kpisQ.error && <Alert variant="destructive" className="m-4"><AlertCircle className="h-4 w-4" /><AlertDescription>{(kpisQ.error as Error).message}</AlertDescription></Alert>}
          {!kpisQ.isLoading && rows.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">Nessun venditore nel periodo selezionato.</div>}
          {rows.length > 0 && (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Venditore</TableHead>
                    <TableHead className="text-right">Progr.</TableHead>
                    <TableHead className="text-right">Eseg.</TableHead>
                    <TableHead className="text-right">No-show</TableHead>
                    <TableHead className="text-right">Cancl.</TableHead>
                    <TableHead className="text-right">% Esec.</TableHead>
                    <TableHead className="text-right">Ord.</TableHead>
                    <TableHead className="text-right">% Vend.</TableHead>
                    <TableHead className="text-right">Lordo</TableHead>
                    <TableHead className="text-right">Imponib.</TableHead>
                    <TableHead className="text-right">Conseg.</TableHead>
                    <TableHead className="text-right">% Cons.</TableHead>
                    <TableHead>Tier</TableHead>
                    <TableHead className="text-right">Bonus</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const ext = extByUser.get(r.user_id);
                    const imponibile = ext?.imponibile ?? r.imponibile;
                    const deliveredCount = deliveriesMode === "cohort"
                      ? (ext?.delivered_count_cohort ?? 0)
                      : (ext?.delivered_count_period ?? r.consegnati_periodo);
                    const deliveredPct = deliveriesMode === "cohort"
                      ? ext?.perc_delivered_on_sold_cohort
                      : (ext?.perc_delivered_on_sold_period ?? r.perc_consegne_periodo);
                    return (
                    <TableRow key={r.user_id} className="hover:bg-muted/50">
                      <TableCell>
                        <Link to={`/sales/performance-sheet/${r.user_id}`} className="group inline-flex items-center gap-1 hover:underline">
                          <div>
                            <div className="font-medium">{r.full_name ?? r.email ?? "—"}</div>
                            {r.full_name && <div className="text-xs text-muted-foreground">{r.email}</div>}
                          </div>
                          <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(r.appuntamenti_programmati)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(r.appuntamenti_eseguiti)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(r.no_show)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(r.cancellati)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtPct(r.perc_esecuzione)}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{fmtNum(r.ordini_venduti)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtPct(r.perc_vendita)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtEur(r.lordo)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground" title={ext?.taxable_basis ?? undefined}>
                        {fmtEur(imponibile)}
                        {ext?.taxable_basis === "mixed" && <span className="ml-1 text-[10px] text-amber-600">mix</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(deliveredCount)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtPct(deliveredPct ?? null)}</TableCell>
                      <TableCell>
                        {r.bonus?.tier_label ? <Badge variant="secondary">{r.bonus.tier_label}</Badge> : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{fmtEur(r.bonus?.bonus_amount ?? 0)}</TableCell>
                    </TableRow>
                  );})}
                </TableBody>
                {aggQ.data && (
                  <TableFooter>
                    <TableRow>
                      <TableCell className="font-semibold">Totale</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(aggQ.data.appuntamenti_programmati)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(aggQ.data.appuntamenti_eseguiti)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(aggQ.data.no_show)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(aggQ.data.cancellati)}</TableCell>
                      <TableCell />
                      <TableCell className="text-right tabular-nums font-semibold">{fmtNum(aggQ.data.ordini_venduti)}</TableCell>
                      <TableCell />
                      <TableCell className="text-right tabular-nums font-semibold">{fmtEur(aggQ.data.lordo)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{fmtEur(aggQ.data.imponibile)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(aggQ.data.consegnati_periodo)}</TableCell>
                      <TableCell />
                      <TableCell />
                      <TableCell className="text-right tabular-nums font-semibold">{fmtEur(aggQ.data.bonus_totale)}</TableCell>
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <SalesPerformanceBySourceSection brandId={activeBrandId} from={from} to={to} />
    </div>
  );
}

function KpiTile({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold tabular-nums mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}
