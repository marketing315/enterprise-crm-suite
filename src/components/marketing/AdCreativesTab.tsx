import { useState, useMemo } from "react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { it } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Image as ImageIcon } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAdCreativeStats } from "@/hooks/useAdCreativeStats";
import { useAdPlatformStats } from "@/hooks/useAdPlatformStats";
import type { AdPlatform } from "@/types/adPlatform";

export function AdCreativesTab() {
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [platformFilter, setPlatformFilter] = useState<AdPlatform | "all">("all");
  const [campaignFilter, setCampaignFilter] = useState<string>("all");

  const dateRange = useMemo(() => ({
    from: format(startOfMonth(selectedMonth), "yyyy-MM-dd"),
    to: format(endOfMonth(selectedMonth), "yyyy-MM-dd"),
  }), [selectedMonth]);

  const platform = platformFilter === "all" ? null : platformFilter;
  const campaignId = campaignFilter === "all" ? null : campaignFilter;

  const { data: creatives, isLoading } = useAdCreativeStats({
    fromDate: dateRange.from,
    toDate: dateRange.to,
    platform,
    campaignId,
  });

  // Campaign options from campaign-level stats
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

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
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
            <SelectItem value="google" disabled className="opacity-50">
              Google Ads (soon)
            </SelectItem>
          </SelectContent>
        </Select>

        {campaignOptions.length > 0 && (
          <Select value={campaignFilter} onValueChange={setCampaignFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Campagna" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutte le campagne</SelectItem>
              {campaignOptions.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Creatives Grid */}
      {isLoading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-4">
                <div className="h-32 bg-muted rounded mb-3" />
                <div className="h-4 bg-muted rounded w-3/4 mb-2" />
                <div className="h-3 bg-muted rounded w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !creatives?.length ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <ImageIcon className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="font-medium">Nessuna creatività trovata</p>
            <p className="text-sm mt-1">
              Esegui una "Sync Storica" dalla tab Statistiche ADV per importare i dati ad-level.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {creatives.map((creative) => (
            <Card key={`${creative.external_ad_id}-${creative.brand_id}`} className="overflow-hidden">
              {/* Thumbnail */}
              <div className="aspect-video bg-muted relative overflow-hidden">
                {creative.thumbnail_url ? (
                  <img
                    src={creative.thumbnail_url}
                    alt={creative.external_ad_name || "Ad creative"}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                      (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
                    }}
                  />
                ) : null}
                <div className={`absolute inset-0 flex items-center justify-center ${creative.thumbnail_url ? "hidden" : ""}`}>
                  <ImageIcon className="h-10 w-10 text-muted-foreground/40" />
                </div>
                {/* Platform badge */}
                <span className="absolute top-2 right-2 bg-background/80 backdrop-blur-sm text-xs font-medium px-2 py-0.5 rounded capitalize">
                  {creative.platform}
                </span>
              </div>

              <CardContent className="p-4 space-y-3">
                {/* Ad name & campaign */}
                <div>
                  <p className="font-medium text-sm truncate" title={creative.external_ad_name || undefined}>
                    {creative.external_ad_name || creative.external_ad_id}
                  </p>
                  <p className="text-xs text-muted-foreground truncate" title={creative.external_campaign_name || undefined}>
                    {creative.external_campaign_name || creative.external_campaign_id}
                  </p>
                </div>

                {/* Metrics grid */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <MetricCell label="Spend" value={`€${creative.total_spend.toLocaleString("it-IT", { maximumFractionDigits: 0 })}`} />
                  <MetricCell label="CTR" value={creative.ctr != null ? `${creative.ctr}%` : "—"} />
                  <MetricCell label="CPC" value={creative.cpc != null ? `€${creative.cpc.toFixed(2)}` : "—"} />
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <MetricCell label="Impression" value={formatCompact(creative.total_impressions)} />
                  <MetricCell label="Click" value={formatCompact(creative.total_clicks)} />
                  <MetricCell label="Reach" value={formatCompact(creative.total_reach)} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("it-IT");
}
