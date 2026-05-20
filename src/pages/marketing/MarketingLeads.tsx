import { useState, useMemo } from "react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { it } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Users,
  Plus,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { useBrand } from "@/contexts/BrandContext";
import { useHasMarketingAccess } from "@/hooks/useMarketingAccess";
import { useMarketingLeadsByCampaign } from "@/hooks/useMarketingLeads";
import { CreateMarketingLeadDialog } from "@/components/marketing/CreateMarketingLeadDialog";

export default function MarketingLeads() {
  const { currentBrand, hasBrandSelected } = useBrand();
  const hasAccess = useHasMarketingAccess();
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const dateRange = useMemo(() => ({
    from: format(startOfMonth(selectedMonth), "yyyy-MM-dd"),
    to: format(endOfMonth(selectedMonth), "yyyy-MM-dd"),
  }), [selectedMonth]);

  const { data: leads, isLoading } = useMarketingLeadsByCampaign(
    dateRange.from,
    dateRange.to
  );

  const handlePrevMonth = () => setSelectedMonth((d) => subMonths(d, 1));
  const handleNextMonth = () => {
    setSelectedMonth((d) => {
      const next = new Date(d);
      next.setMonth(next.getMonth() + 1);
      return next;
    });
  };

  // Summary KPIs - always computed (hooks rule)
  const totals = useMemo(() => {
    if (!leads?.length) return { total: 0, manual: 0, meta: 0, webhook: 0, matched: 0, unmatched: 0 };
    return leads.reduce(
      (acc, l) => ({
        total: acc.total + l.total_leads,
        manual: acc.manual + l.manual_leads,
        meta: acc.meta + l.meta_leads,
        webhook: acc.webhook + l.webhook_leads,
        matched: acc.matched + l.meta_matched,
        unmatched: acc.unmatched + l.meta_unmatched,
      }),
      { total: 0, manual: 0, meta: 0, webhook: 0, matched: 0, unmatched: 0 }
    );
  }, [leads]);

  if (!hasBrandSelected) {
    return (
      <div className="p-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Seleziona un brand dalla sidebar.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Non hai i permessi per accedere a questa sezione.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6" />
            Lead Marketing
          </h1>
          <p className="text-muted-foreground">
            Gestione lead per campagna — {currentBrand?.name}
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nuovo Lead Manuale
        </Button>
      </div>

      {/* Month Selector */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={handlePrevMonth} aria-label="Indietro">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-[140px] text-center font-medium">
          {format(selectedMonth, "MMMM yyyy", { locale: it })}
        </span>
        <Button variant="outline" size="icon" onClick={handleNextMonth} aria-label="Avanti">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KpiCard label="Lead Totali" value={totals.total} />
        <KpiCard label="Manuali" value={totals.manual} variant="default" />
        <KpiCard label="Meta" value={totals.meta} variant="secondary" />
        <KpiCard label="Webhook" value={totals.webhook} variant="outline" />
        <KpiCard
          label="Meta Match"
          value={totals.matched}
          icon={<CheckCircle2 className="h-4 w-4 text-primary" />}
        />
        <KpiCard
          label="Meta Unmatched"
          value={totals.unmatched}
          icon={<AlertTriangle className="h-4 w-4 text-destructive" />}
        />
      </div>

      {/* Campaign Table */}
      <Card>
        <CardHeader>
          <CardTitle>Lead per Campagna</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-20 flex items-center justify-center text-muted-foreground">
              Caricamento...
            </div>
          ) : !leads?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              Nessuna campagna attiva nel periodo selezionato.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">Campagna</th>
                    <th className="text-left py-2">Canale</th>
                    <th className="text-right py-2">Totali</th>
                    <th className="text-right py-2">Manuali</th>
                    <th className="text-right py-2">Meta</th>
                    <th className="text-right py-2">Webhook</th>
                    <th className="text-right py-2">Meta Match</th>
                    <th className="text-right py-2">Unmatched</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((row) => (
                    <tr key={row.campaign_id} className="border-b">
                      <td className="py-2 font-medium">{row.campaign_name}</td>
                      <td className="py-2">{row.channel_name}</td>
                      <td className="py-2 text-right font-semibold">{row.total_leads}</td>
                      <td className="py-2 text-right">{row.manual_leads}</td>
                      <td className="py-2 text-right">{row.meta_leads}</td>
                      <td className="py-2 text-right">{row.webhook_leads}</td>
                      <td className="py-2 text-right">
                        {row.meta_matched > 0 && (
                          <Badge variant="outline" className="border-primary/30 text-primary">
                            {row.meta_matched}
                          </Badge>
                        )}
                      </td>
                      <td className="py-2 text-right">
                        {row.meta_unmatched > 0 && (
                          <Badge variant="destructive" className="text-xs">
                            {row.meta_unmatched}
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reconciliation Alert */}
      {totals.unmatched > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>{totals.unmatched} lead Meta</strong> non sono stati ancora riconciliati con
            un contatto nel CRM. Verifica i dati nella sezione Contatti.
          </AlertDescription>
        </Alert>
      )}

      {/* Create Dialog */}
      <CreateMarketingLeadDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
      />
    </div>
  );
}

function KpiCard({
  label,
  value,
  variant,
  icon,
}: {
  label: string;
  value: number;
  variant?: string;
  icon?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2">
          {icon}
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
        <p className="text-2xl font-bold mt-1">{value}</p>
      </CardContent>
    </Card>
  );
}
