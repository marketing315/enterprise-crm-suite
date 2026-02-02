import { useState, useMemo } from "react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { it } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertCircle, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { useBrand } from "@/contexts/BrandContext";
import { useHasMarketingAccess } from "@/hooks/useMarketingAccess";
import { useMarketingCampaignKpis, useMarketingSummaryKpis } from "@/hooks/useMarketingKpis";
import { arrayToCSV, downloadCSV } from "@/lib/csvExport";

export default function MarketingReports() {
  const { currentBrand, hasBrandSelected } = useBrand();
  const hasAccess = useHasMarketingAccess();
  
  const [selectedMonth, setSelectedMonth] = useState(new Date());

  const dateRange = useMemo(() => ({
    from: format(startOfMonth(selectedMonth), "yyyy-MM-dd"),
    to: format(endOfMonth(selectedMonth), "yyyy-MM-dd"),
  }), [selectedMonth]);

  const { data: campaignKpis, isLoading } = useMarketingCampaignKpis({
    fromDate: dateRange.from,
    toDate: dateRange.to,
  });

  const { data: summaryKpis } = useMarketingSummaryKpis(dateRange.from, dateRange.to);


  const handlePrevMonth = () => setSelectedMonth((d) => subMonths(d, 1));
  const handleNextMonth = () => setSelectedMonth((d) => {
    const next = new Date(d);
    next.setMonth(next.getMonth() + 1);
    return next;
  });

  const exportCSV = () => {
    if (!campaignKpis?.length) return;

    const columns = [
      { key: "campaign_name" as const, label: "Campagna" },
      { key: "channel_name" as const, label: "Canale" },
      { key: "leads_count" as const, label: "Lead" },
      { key: "deals_count" as const, label: "Deal" },
      { key: "deals_won" as const, label: "Deal Vinti" },
      { key: "revenue" as const, label: "Ricavi (€)" },
      { key: "marketing_cost" as const, label: "Costi (€)" },
      { key: "cpl" as const, label: "CPL (€)" },
      { key: "cac" as const, label: "CAC (€)" },
      { key: "roi" as const, label: "ROI (%)" },
    ];

    const csv = arrayToCSV(campaignKpis, columns);
    downloadCSV(csv, `marketing-report-${format(selectedMonth, "yyyy-MM")}.csv`);
  };

  if (!hasBrandSelected) {
    return (
      <div className="p-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Seleziona un brand dalla sidebar.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Non hai i permessi per accedere a questa sezione.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Report Marketing</h1>
          <p className="text-muted-foreground">
            Analisi performance per {currentBrand?.name}
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={handlePrevMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[140px] text-center font-medium">
              {format(selectedMonth, "MMMM yyyy", { locale: it })}
            </span>
            <Button variant="outline" size="icon" onClick={handleNextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <Button variant="outline" onClick={exportCSV} disabled={!campaignKpis?.length}>
            <Download className="h-4 w-4 mr-2" />
            Esporta CSV
          </Button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">Ricavi Totali</div>
            <div className="text-2xl font-bold">
              €{(summaryKpis?.total_revenue || 0).toLocaleString("it-IT")}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">Costi Totali</div>
            <div className="text-2xl font-bold">
              €{(summaryKpis?.total_marketing_cost || 0).toLocaleString("it-IT")}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">Margine</div>
            <div className={`text-2xl font-bold ${
              summaryKpis && summaryKpis.total_revenue - summaryKpis.total_marketing_cost >= 0
                ? "text-green-600"
                : "text-red-600"
            }`}>
              €{((summaryKpis?.total_revenue || 0) - (summaryKpis?.total_marketing_cost || 0)).toLocaleString("it-IT")}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">ROI Medio</div>
            <div className={`text-2xl font-bold ${
              summaryKpis && summaryKpis.overall_roi >= 0 ? "text-green-600" : "text-red-600"
            }`}>
              {(summaryKpis?.overall_roi || 0).toFixed(1)}%
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Trend Chart - TODO: Replace with real RPC data when available */}
      <Card>
        <CardHeader>
          <CardTitle>Trend Ultimi 6 Mesi</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center text-muted-foreground bg-muted/30 rounded-lg border-2 border-dashed">
            <div className="text-center space-y-2">
              <p className="font-medium">Dati trend in arrivo</p>
              <p className="text-sm">
                I grafici di tendenza saranno disponibili con i prossimi aggiornamenti.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Campaign Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Dettaglio per Campagna</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Caricamento...</div>
          ) : !campaignKpis?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              Nessun dato disponibile per il periodo selezionato.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campagna</TableHead>
                    <TableHead>Canale</TableHead>
                    <TableHead className="text-right">Lead</TableHead>
                    <TableHead className="text-right">Deal</TableHead>
                    <TableHead className="text-right">Vinti</TableHead>
                    <TableHead className="text-right">Ricavi</TableHead>
                    <TableHead className="text-right">Costi</TableHead>
                    <TableHead className="text-right">CPL</TableHead>
                    <TableHead className="text-right">CAC</TableHead>
                    <TableHead className="text-right">ROI</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaignKpis.map((kpi) => (
                    <TableRow key={kpi.campaign_id}>
                      <TableCell className="font-medium">{kpi.campaign_name}</TableCell>
                      <TableCell>{kpi.channel_name}</TableCell>
                      <TableCell className="text-right">{kpi.leads_count}</TableCell>
                      <TableCell className="text-right">{kpi.deals_count}</TableCell>
                      <TableCell className="text-right">{kpi.deals_won}</TableCell>
                      <TableCell className="text-right">€{kpi.revenue.toLocaleString("it-IT")}</TableCell>
                      <TableCell className="text-right">€{kpi.marketing_cost.toLocaleString("it-IT")}</TableCell>
                      <TableCell className="text-right">€{kpi.cpl.toFixed(2)}</TableCell>
                      <TableCell className="text-right">€{kpi.cac.toFixed(2)}</TableCell>
                      <TableCell className={`text-right font-medium ${
                        kpi.roi >= 0 ? "text-green-600" : "text-red-600"
                      }`}>
                        {kpi.roi.toFixed(1)}%
                      </TableCell>
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
