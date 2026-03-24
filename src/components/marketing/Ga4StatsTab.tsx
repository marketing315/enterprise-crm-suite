import { useMemo } from "react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { useBrand } from "@/contexts/BrandContext";
import { useGa4Stats, useGa4Summary, useGa4SyncTrigger } from "@/hooks/useGa4Stats";
import { useAdPlatformStatsSummary } from "@/hooks/useAdPlatformStats";
import { useMarketingSummaryKpis } from "@/hooks/useMarketingKpis";
import { Ga4KpiCards } from "./Ga4KpiCards";
import { Ga4TrendChart } from "./Ga4TrendChart";
import { Ga4SourcesChart } from "./Ga4SourcesChart";
import { Ga4PagesTable } from "./Ga4PagesTable";
import { Ga4CampaignsTable } from "./Ga4CampaignsTable";
import { Ga4ConversionAnalysis } from "./Ga4ConversionAnalysis";
import { toast } from "sonner";
import { useState } from "react";

interface Ga4StatsTabProps {
  fromDate: string;
  toDate: string;
}

export function Ga4StatsTab({ fromDate, toDate }: Ga4StatsTabProps) {
  const { currentBrand } = useBrand();
  const { data: stats, isLoading } = useGa4Stats(fromDate, toDate);
  const { summary, isLoading: summaryLoading } = useGa4Summary(fromDate, toDate);
  const { triggerSync } = useGa4SyncTrigger();
  const [syncing, setSyncing] = useState(false);

  const { data: advSummary } = useAdPlatformStatsSummary({ fromDate, toDate });
  const { data: mktKpis } = useMarketingSummaryKpis(fromDate, toDate);

  const crmLeads = mktKpis?.total_leads || 0;

  const handleSync = async () => {
    if (!currentBrand?.id) return;
    setSyncing(true);
    try {
      const result = await triggerSync(currentBrand.id, fromDate, toDate);
      toast.success(`Sync completato: ${result.days_synced} giorni importati`);
    } catch (err: any) {
      toast.error(`Errore sync GA4: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Statistiche Sito Web (GA4)</h2>
        <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Sync..." : "Sync GA4"}
        </Button>
      </div>

      <Ga4KpiCards summary={summary} isLoading={summaryLoading} />

      <Ga4TrendChart stats={stats || []} isLoading={isLoading} />

      <div className="grid md:grid-cols-2 gap-6">
        <Ga4SourcesChart stats={stats || []} isLoading={isLoading} />
        <Ga4ConversionAnalysis
          ga4Summary={summary}
          advSummary={advSummary}
          crmLeads={crmLeads}
          isLoading={summaryLoading}
        />
      </div>

      <Ga4PagesTable stats={stats || []} isLoading={isLoading} />

      <Ga4CampaignsTable stats={stats || []} isLoading={isLoading} />
    </div>
  );
}
