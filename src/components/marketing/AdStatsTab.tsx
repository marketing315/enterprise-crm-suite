import { useState, useMemo } from "react";
import { format, startOfMonth, endOfMonth, subMonths, subYears } from "date-fns";
import { it } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, RefreshCw, Clock, Download, Link2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBrand } from "@/contexts/BrandContext";
import {
  useAdPlatformStats,
  useAdPlatformStatsTrend,
  useAdPlatformStatsSummary,
} from "@/hooks/useAdPlatformStats";
import { AdStatsKpiCards } from "./AdStatsKpiCards";
import { AdStatsTrendChart } from "./AdStatsTrendChart";
import { AdStatsTable } from "./AdStatsTable";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { AdPlatform } from "@/types/adPlatform";

export function AdStatsTab() {
  const { currentBrand, isAllBrandsSelected } = useBrand();
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [platformFilter, setPlatformFilter] = useState<AdPlatform | "all">("all");
  const [campaignFilter, setCampaignFilter] = useState<string>("all");
  const [isSyncing, setIsSyncing] = useState(false);
  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);
  const [isSyncingGoogle, setIsSyncingGoogle] = useState(false);

  const dateRange = useMemo(() => ({
    from: format(startOfMonth(selectedMonth), "yyyy-MM-dd"),
    to: format(endOfMonth(selectedMonth), "yyyy-MM-dd"),
  }), [selectedMonth]);

  const platform = platformFilter === "all" ? null : platformFilter;
  const campaignId = campaignFilter === "all" ? null : campaignFilter;

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useAdPlatformStats({
    fromDate: dateRange.from,
    toDate: dateRange.to,
    platform,
    campaignId,
  });

  const { data: trend, isLoading: trendLoading, refetch: refetchTrend } = useAdPlatformStatsTrend({
    fromDate: dateRange.from,
    toDate: dateRange.to,
    platform,
    campaignId,
  });

  const { data: summary, isLoading: summaryLoading, refetch: refetchSummary } = useAdPlatformStatsSummary({
    fromDate: dateRange.from,
    toDate: dateRange.to,
    platform,
    campaignId,
  });

  // Build campaign options from stats (unfiltered by campaign)
  const { data: allStats } = useAdPlatformStats({
    fromDate: dateRange.from,
    toDate: dateRange.to,
    platform,
  });

  const campaignOptions = useMemo(() => {
    if (!allStats?.length) return [];
    const unique = new Map<string, string>();
    for (const s of allStats) {
      const key = s.external_campaign_id;
      const label = s.campaign_name || s.external_campaign_name || key;
      if (!unique.has(key)) unique.set(key, label);
    }
    return Array.from(unique.entries()).map(([id, name]) => ({ id, name }));
  }, [allStats]);

  const handlePrevMonth = () => setSelectedMonth((d) => subMonths(d, 1));
  const handleNextMonth = () => {
    setSelectedMonth((d) => {
      const next = new Date(d);
      next.setMonth(next.getMonth() + 1);
      return next;
    });
  };

  const handleRefresh = () => {
    refetchStats();
    refetchTrend();
    refetchSummary();
  };

  const handleHistoricalSync = async () => {
    setIsSyncing(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.access_token) {
        toast.error("Sessione non trovata");
        return;
      }

      const fromDate = format(subYears(new Date(), 2), "yyyy-MM-dd");
      const toDate = format(new Date(), "yyyy-MM-dd");
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

      const response = await fetch(
        `${supabaseUrl}/functions/v1/ads-stats-meta?from=${fromDate}&to=${toDate}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.session.access_token}`,
          },
        }
      );

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Errore nella sincronizzazione");
      }

      const successCount = result.results?.filter((r: any) => r.success).length ?? 0;
      const totalCampaigns = result.results?.reduce((sum: number, r: any) => sum + r.campaigns, 0) ?? 0;
      toast.success(`Sync Meta completata: ${successCount} account, ${totalCampaigns} campagne-giorno importate`);
      handleRefresh();
    } catch (err: any) {
      console.error("Historical sync error:", err);
      toast.error(err.message || "Errore nella sincronizzazione storica");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleConnectGoogleAds = async () => {
    setIsConnectingGoogle(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.access_token) {
        toast.error("Sessione non trovata");
        return;
      }

      const brandId = currentBrand?.id;
      if (!brandId) {
        toast.error("Seleziona un brand");
        return;
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/google-oauth-start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.session.access_token}`,
        },
        body: JSON.stringify({ brand_id: brandId }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Errore nell'avvio OAuth");
      }

      if (result.auth_url) {
        // Use top-level window to avoid iframe restrictions from Google
        const w = window.top || window;
        w.location.href = result.auth_url;
      }
    } catch (err: any) {
      console.error("Google OAuth start error:", err);
      toast.error(err.message || "Errore nel collegamento Google Ads");
    } finally {
      setIsConnectingGoogle(false);
    }
  };

  const handleGoogleAdsSync = async () => {
    setIsSyncingGoogle(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.access_token) {
        toast.error("Sessione non trovata");
        return;
      }

      const fromDate = format(subYears(new Date(), 2), "yyyy-MM-dd");
      const toDate = format(new Date(), "yyyy-MM-dd");
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

      const response = await fetch(
        `${supabaseUrl}/functions/v1/google-ads-sync?from=${fromDate}&to=${toDate}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.session.access_token}`,
          },
        }
      );

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Errore nella sincronizzazione Google Ads");
      }

      const successCount = result.results?.filter((r: any) => r.success).length ?? 0;
      const totalCampaigns = result.results?.reduce((sum: number, r: any) => sum + r.campaigns, 0) ?? 0;
      toast.success(`Sync Google Ads completata: ${successCount} account, ${totalCampaigns} campagne-giorno importate`);
      handleRefresh();
    } catch (err: any) {
      console.error("Google Ads sync error:", err);
      toast.error(err.message || "Errore nella sincronizzazione Google Ads");
    } finally {
      setIsSyncingGoogle(false);
    }
  };

  const lastImport = summary?.last_import 
    ? format(new Date(summary.last_import), "dd/MM/yyyy HH:mm", { locale: it })
    : null;

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-4">
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

        <div className="flex flex-wrap items-center gap-3">
          <Select 
            value={platformFilter} 
            onValueChange={(v) => setPlatformFilter(v as AdPlatform | "all")}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Piattaforma" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutte</SelectItem>
              <SelectItem value="meta">Meta Ads</SelectItem>
              <SelectItem value="google">Google Ads</SelectItem>
            </SelectContent>
          </Select>

          {campaignOptions.length > 0 && (
            <Select
              value={campaignFilter}
              onValueChange={setCampaignFilter}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Campagna" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutte le campagne</SelectItem>
                {campaignOptions.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Aggiorna
          </Button>

          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleHistoricalSync}
            disabled={isSyncing}
          >
            <Download className="h-4 w-4 mr-2" />
            {isSyncing ? "Sincronizzazione..." : "Sync Meta"}
          </Button>

          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleGoogleAdsSync}
            disabled={isSyncingGoogle}
          >
            <Download className="h-4 w-4 mr-2" />
            {isSyncingGoogle ? "Sincronizzazione..." : "Sync Google"}
          </Button>

          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleConnectGoogleAds}
            disabled={isConnectingGoogle || isAllBrandsSelected}
          >
            <Link2 className="h-4 w-4 mr-2" />
            {isConnectingGoogle ? "Collegamento..." : "Collega Google Ads"}
          </Button>
        </div>
      </div>

      {/* Brand info for multi-brand */}
      {isAllBrandsSelected && (
        <div className="text-sm text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
          📊 Visualizzazione aggregata di tutti i brand
        </div>
      )}

      {/* Last Import Info */}
      {lastImport && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          <span>Ultimo import: {lastImport}</span>
        </div>
      )}

      {/* KPI Cards */}
      <AdStatsKpiCards summary={summary} isLoading={summaryLoading} />

      {/* Trend Chart */}
      <AdStatsTrendChart data={trend} isLoading={trendLoading} />

      {/* Campaign Table */}
      <AdStatsTable data={stats} isLoading={statsLoading} showBrand={isAllBrandsSelected} />
    </div>
  );
}
