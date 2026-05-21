/**
 * F1 — Pagina performance canali (Modulo A: Canali & Costi)
 * Route: /marketing/performance
 *
 * Aggrega via RPC `get_channel_performance` (vista `v_channel_spend_daily` +
 * `v_lead_cost`). Accessibile ai ruoli finance del brand corrente.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format, startOfMonth, endOfMonth, subDays } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Upload,
  Phone,
  AlertCircle,
  TrendingUp,
  Banknote,
  Target,
  Users2,
} from "lucide-react";
import { useBrand } from "@/contexts/BrandContext";
import { useHasMarketingAccess } from "@/hooks/useMarketingAccess";
import { useChannelPerformance } from "@/hooks/useChannelPerformance";
import {
  SourceFilterBar,
  type SourceFilter,
  type PeriodValue,
} from "@/components/shared/SourceFilterBar";
import { CostCsvImportDialog } from "@/components/marketing/CostCsvImportDialog";

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

function periodToRange(p: PeriodValue): { from: string; to: string } {
  const today = new Date();
  const iso = (d: Date) => format(d, "yyyy-MM-dd");
  switch (p.preset) {
    case "today":     return { from: iso(today), to: iso(today) };
    case "yesterday": { const y = subDays(today, 1); return { from: iso(y), to: iso(y) }; }
    case "last_7":    return { from: iso(subDays(today, 6)), to: iso(today) };
    case "last_30":   return { from: iso(subDays(today, 29)), to: iso(today) };
    case "last_90":   return { from: iso(subDays(today, 89)), to: iso(today) };
    case "mtd":       return { from: iso(startOfMonth(today)), to: iso(today) };
    case "qtd":       return { from: iso(subDays(today, 90)), to: iso(today) };
    case "ytd":       return { from: iso(new Date(today.getFullYear(), 0, 1)), to: iso(today) };
    case "custom":    return { from: p.from ?? iso(startOfMonth(today)), to: p.to ?? iso(endOfMonth(today)) };
    default:          return { from: iso(startOfMonth(today)), to: iso(today) };
  }
}

export default function MarketingPerformance() {
  const { currentBrand, hasBrandSelected, isAllBrandsSelected } = useBrand();
  const hasAccess = useHasMarketingAccess();

  const [period, setPeriod] = useState<PeriodValue>({ preset: "last_30" });
  const [filter, setFilter] = useState<SourceFilter>({});
  const [importOpen, setImportOpen] = useState(false);

  const range = useMemo(() => periodToRange(period), [period]);
  const { data: rows, isLoading, error } = useChannelPerformance({
    from: range.from,
    to: range.to,
    sourceFilter: filter,
  });

  // KPI roll-up
  const totals = useMemo(() => {
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
  }, [rows]);

  if (!hasBrandSelected) {
    return (
      <div className="container mx-auto p-6">
        <h1 className="text-3xl font-bold mb-4">Performance canali</h1>
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Seleziona un brand per visualizzare le performance.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isAllBrandsSelected) {
    return (
      <div className="container mx-auto p-6">
        <h1 className="text-3xl font-bold mb-4">Performance canali</h1>
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Le performance per canale sono disponibili solo su un brand specifico (non in vista "Azienda Intera").
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="container mx-auto p-6">
        <h1 className="text-3xl font-bold mb-4">Performance canali</h1>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Accesso negato: ruolo finance richiesto.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Performance canali</h1>
            <p className="text-muted-foreground mt-1">
              Brand <strong>{currentBrand?.name}</strong> · {range.from} → {range.to}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/admin/tracking-numbers">
                <Phone className="w-4 h-4 mr-2" />
                Numeri verdi
              </Link>
            </Button>
            <Button onClick={() => setImportOpen(true)}>
              <Upload className="w-4 h-4 mr-2" />
              Importa costi CSV
            </Button>
          </div>
        </div>

        <SourceFilterBar
          value={filter}
          onChange={setFilter}
          period={period}
          onPeriodChange={setPeriod}
        />

        {/* KPI roll-up */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard icon={<Users2 className="w-4 h-4" />} label="Leads" value={fmtNum(totals.leads)} />
          <KpiCard icon={<Banknote className="w-4 h-4" />} label="Spesa" value={fmtEur(totals.spend)} />
          <KpiCard
            icon={<Target className="w-4 h-4" />}
            label="CPL medio"
            value={fmtEur(totals.cpl)}
            hint={`CAC: ${fmtEur(totals.cac)}`}
          />
          <KpiCard
            icon={<TrendingUp className="w-4 h-4" />}
            label="ROI"
            value={fmtPct(totals.roi)}
            hint={`Fatturato vinto: ${fmtEur(totals.revenue)}`}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Dettaglio per canale</CardTitle>
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
            ) : !rows || rows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Nessun dato per il periodo selezionato. Importa i costi CSV o controlla l'attribuzione lead.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Canale</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">Leads</TableHead>
                      <TableHead className="text-right">Spesa</TableHead>
                      <TableHead className="text-right">CPL</TableHead>
                      <TableHead className="text-right">Deals</TableHead>
                      <TableHead className="text-right">Won</TableHead>
                      <TableHead className="text-right">Fatturato</TableHead>
                      <TableHead className="text-right">CAC</TableHead>
                      <TableHead className="text-right">ROI</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.channel_id}>
                        <TableCell className="font-medium">{r.channel_name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{r.channel_type}</Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{fmtNum(r.leads_count)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtEur(r.spend)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtEur(r.cpl)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtNum(r.deals_count)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtNum(r.deals_won)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtEur(r.revenue)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtEur(r.cac)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          <span
                            className={
                              r.roi == null
                                ? "text-muted-foreground"
                                : r.roi >= 0
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-destructive"
                            }
                          >
                            {fmtPct(r.roi)}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <CostCsvImportDialog open={importOpen} onOpenChange={setImportOpen} />
      </div>
    </TooltipProvider>
  );
}

function KpiCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          {icon}
          <span>{label}</span>
        </div>
        <div className="text-2xl font-semibold mt-2 tabular-nums">{value}</div>
        {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
}
