import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import type { 
  AdPlatform, 
  AdPlatformStatAggregated, 
  AdPlatformStatTrend, 
  AdPlatformStatSummary 
} from "@/types/adPlatform";

interface UseAdPlatformStatsParams {
  fromDate: string;
  toDate: string;
  platform?: AdPlatform | null;
}

export function useAdPlatformStats({ fromDate, toDate, platform }: UseAdPlatformStatsParams) {
  const { currentBrand, isAllBrandsSelected } = useBrand();
  const brandId = currentBrand?.id;

  return useQuery({
    queryKey: ["ad-platform-stats", isAllBrandsSelected ? "all" : brandId, fromDate, toDate, platform],
    queryFn: async (): Promise<AdPlatformStatAggregated[]> => {
      if (!brandId) return [];

      const { data, error } = await supabase.rpc("get_ad_platform_stats", {
        p_brand_id: brandId,
        p_from: fromDate,
        p_to: toDate,
        p_platform: platform ?? null,
      });

      if (error) throw error;
      return (data || []) as AdPlatformStatAggregated[];
    },
    enabled: !!brandId && !!fromDate && !!toDate,
  });
}

export function useAdPlatformStatsTrend({ fromDate, toDate, platform }: UseAdPlatformStatsParams) {
  const { currentBrand, isAllBrandsSelected } = useBrand();
  const brandId = currentBrand?.id;

  return useQuery({
    queryKey: ["ad-platform-stats-trend", isAllBrandsSelected ? "all" : brandId, fromDate, toDate, platform],
    queryFn: async (): Promise<AdPlatformStatTrend[]> => {
      if (!brandId) return [];

      const { data, error } = await supabase.rpc("get_ad_platform_stats_trend", {
        p_brand_id: brandId,
        p_from: fromDate,
        p_to: toDate,
        p_platform: platform ?? null,
      });

      if (error) throw error;
      return (data || []) as AdPlatformStatTrend[];
    },
    enabled: !!brandId && !!fromDate && !!toDate,
  });
}

export function useAdPlatformStatsSummary({ fromDate, toDate, platform }: UseAdPlatformStatsParams) {
  const { currentBrand, isAllBrandsSelected } = useBrand();
  const brandId = currentBrand?.id;

  return useQuery({
    queryKey: ["ad-platform-stats-summary", isAllBrandsSelected ? "all" : brandId, fromDate, toDate, platform],
    queryFn: async (): Promise<AdPlatformStatSummary | null> => {
      if (!brandId) return null;

      const { data, error } = await supabase.rpc("get_ad_platform_stats_summary", {
        p_brand_id: brandId,
        p_from: fromDate,
        p_to: toDate,
        p_platform: platform ?? null,
      });

      if (error) throw error;
      // RPC returns array with single row
      const row = Array.isArray(data) ? data[0] : data;
      return row as AdPlatformStatSummary | null;
    },
    enabled: !!brandId && !!fromDate && !!toDate,
  });
}
