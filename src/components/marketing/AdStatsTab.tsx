import { useState, useMemo } from "react";
import { format, startOfMonth, endOfMonth, subMonths, subYears, subDays } from "date-fns";
import { it } from "date-fns/locale";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { RefreshCw, Clock, Download, Link2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { CalendarIcon } from "lucide-react";
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
  const queryClient = useQueryClient();
  const [selectedRange, setSelectedRange] = useState<{ from: Date; to: Date }>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });
  const [platformFilter, setPlatformFilter] = useState<AdPlatform | "all">("all");
  const [campaignFilter, setCampaignFilter] = useState<string>("all");
  const [isSyncing, setIsSyncing] = useState(false);
  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);
  const [isSyncingGoogle, setIsSyncingGoogle] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncLabel, setSyncLabel] = useState("");
  const [syncFromDate, setSyncFromDate] = useState<Date>(subYears(new Date(), 2));
  const [syncToDate, setSyncToDate] = useState<Date>(new Date());

  const dateRange = useMemo(() => ({
    from: format(selectedRange.from, "yyyy-MM-dd"),
    to: format(selectedRange.to, "yyyy-MM-dd"),
  }), [selectedRange]);

  const handlePreset = (days: number) => {
    setSelectedRange({ from: subDays(new Date(), days), to: new Date() });
  };
  const handleThisMonth = () => {
    setSelectedRange({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) });
  };

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

  // Removed prev/next month handlers – replaced by date range picker
  const handleRefresh = () => {
    // Invalidate queries to force re-fetch regardless of staleTime
    queryClient.invalidateQueries({ queryKey: ["ad-platform-stats"] });
    queryClient.invalidateQueries({ queryKey: ["ad-platform-stats-trend"] });
    queryClient.invalidateQueries({ queryKey: ["ad-platform-stats-summary"] });
  };

  const handleHistoricalSync = async () => {
    setIsSyncing(true);
    setSyncProgress(0);
    setSyncLabel("Calcolo periodi da sincronizzare...");
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.access_token) {
        toast.error("Sessione non trovata");
        return;
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

      // Build 2-month chunks
      const chunks: Array<{ from: string; to: string }> = [];
      let cursor = new Date(syncFromDate);
      const end = new Date(syncToDate);
      while (cursor < end) {
        const chunkEnd = new Date(cursor);
        chunkEnd.setMonth(chunkEnd.getMonth() + 2);
        const ce = chunkEnd > end ? end : chunkEnd;
        chunks.push({
          from: format(cursor, "yyyy-MM-dd"),
          to: format(ce, "yyyy-MM-dd"),
        });
        cursor = new Date(ce);
        cursor.setDate(cursor.getDate() + 1);
      }

      // Show summary before starting
      setSyncLabel(`${chunks.length} blocchi da sincronizzare (${format(syncFromDate, "dd/MM/yy")} → ${format(syncToDate, "dd/MM/yy")}). Avvio...`);
      await new Promise(resolve => setTimeout(resolve, 1000));

      let totalSuccess = 0;
      let totalCampaigns = 0;
      let failedChunks = 0;

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        setSyncLabel(`Blocco ${i + 1} di ${chunks.length}: ${chunk.from} → ${chunk.to}`);

        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 3000));
        }

        const response = await fetch(
          `${supabaseUrl}/functions/v1/ads-stats-meta?from=${chunk.from}&to=${chunk.to}`,
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
          console.warn(`Chunk ${chunk.from}-${chunk.to} failed:`, result.error);
          failedChunks++;
        } else {
          totalSuccess += result.results?.filter((r: any) => r.success).length ?? 0;
          totalCampaigns += result.results?.reduce((sum: number, r: any) => sum + r.campaigns, 0) ?? 0;
        }

        // Update progress AFTER each chunk completes
        const pct = Math.round(((i + 1) / chunks.length) * 100);
        setSyncProgress(pct);
      }

      setSyncLabel(`✅ Completato — ${totalCampaigns} campagne-giorno importate${failedChunks ? `, ${failedChunks} blocchi falliti` : ""}`);
      toast.success(`Sync Meta completata: ${totalSuccess} account-chunk, ${totalCampaigns} campagne-giorno`);
      handleRefresh();
    } catch (err: any) {
      console.error("Historical sync error:", err);
      toast.error(err.message || "Errore nella sincronizzazione storica");
    } finally {
      setIsSyncing(false);
      setTimeout(() => { setSyncProgress(0); setSyncLabel(""); }, 5000);
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
        <div className="flex flex-wrap items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="justify-start text-left font-normal">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(selectedRange.from, "d MMM", { locale: it })} –{" "}
                {format(selectedRange.to, "d MMM yyyy", { locale: it })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                initialFocus
                mode="range"
                defaultMonth={selectedRange.from}
                selected={{ from: selectedRange.from, to: selectedRange.to }}
                onSelect={(range) => {
                  if (range?.from && range?.to) setSelectedRange({ from: range.from, to: range.to });
                  else if (range?.from) setSelectedRange({ from: range.from, to: range.from });
                }}
                numberOfMonths={2}
                locale={it}
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="sm" onClick={() => handlePreset(7)}>7gg</Button>
          <Button variant="outline" size="sm" onClick={() => handlePreset(30)}>30gg</Button>
          <Button variant="outline" size="sm" onClick={() => handlePreset(90)}>90gg</Button>
          <Button variant="outline" size="sm" onClick={handleThisMonth}>Mese</Button>
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

          {/* Sync Meta with date pickers */}
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="w-[120px] justify-start text-left font-normal text-xs">
                  <CalendarIcon className="h-3 w-3 mr-1" />
                  {format(syncFromDate, "dd/MM/yy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={syncFromDate}
                  onSelect={(d) => d && setSyncFromDate(d)}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
            <span className="text-xs text-muted-foreground">→</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="w-[120px] justify-start text-left font-normal text-xs">
                  <CalendarIcon className="h-3 w-3 mr-1" />
                  {format(syncToDate, "dd/MM/yy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={syncToDate}
                  onSelect={(d) => d && setSyncToDate(d)}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleHistoricalSync}
              disabled={isSyncing}
            >
              <Download className="h-4 w-4 mr-2" />
              {isSyncing ? "Sync..." : "Sync Meta"}
            </Button>
          </div>

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
      {/* Sync progress bar */}
      {(isSyncing || syncProgress > 0) && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Sincronizzazione Meta: {syncLabel}</span>
            <span>{syncProgress}%</span>
          </div>
          <Progress value={syncProgress} className="h-2" />
        </div>
      )}

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
