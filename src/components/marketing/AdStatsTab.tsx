import { useState, useMemo } from "react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { it } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, RefreshCw, Clock } from "lucide-react";
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
import type { AdPlatform } from "@/types/adPlatform";

export function AdStatsTab() {
  const { currentBrand } = useBrand();
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [platformFilter, setPlatformFilter] = useState<AdPlatform | "all">("all");

  const dateRange = useMemo(() => ({
    from: format(startOfMonth(selectedMonth), "yyyy-MM-dd"),
    to: format(endOfMonth(selectedMonth), "yyyy-MM-dd"),
  }), [selectedMonth]);

  const platform = platformFilter === "all" ? null : platformFilter;

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useAdPlatformStats({
    fromDate: dateRange.from,
    toDate: dateRange.to,
    platform,
  });

  const { data: trend, isLoading: trendLoading } = useAdPlatformStatsTrend({
    fromDate: dateRange.from,
    toDate: dateRange.to,
    platform,
  });

  const { data: summary, isLoading: summaryLoading } = useAdPlatformStatsSummary({
    fromDate: dateRange.from,
    toDate: dateRange.to,
    platform,
  });

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

        <div className="flex items-center gap-4">
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
                Google Ads (coming soon)
              </SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Aggiorna
          </Button>
        </div>
      </div>

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
      <AdStatsTable data={stats} isLoading={statsLoading} />
    </div>
  );
}
