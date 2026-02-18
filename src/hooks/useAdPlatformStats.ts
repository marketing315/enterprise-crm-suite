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
  campaignId?: string | null;
}

export function useAdPlatformStats({ fromDate, toDate, platform, campaignId }: UseAdPlatformStatsParams) {
  const { currentBrand, isAllBrandsSelected } = useBrand();
  const brandId = isAllBrandsSelected ? "00000000-0000-0000-0000-000000000000" : currentBrand?.id;

  return useQuery({
    queryKey: ["ad-platform-stats", brandId, fromDate, toDate, platform, campaignId],
    queryFn: async (): Promise<AdPlatformStatAggregated[]> => {
      if (!brandId) return [];

      const { data, error } = await supabase.rpc("get_ad_platform_stats", {
        p_brand_id: brandId,
        p_from: fromDate,
        p_to: toDate,
        p_platform: platform ?? null,
        p_campaign_id: campaignId ?? null,
      });

      if (error) throw error;
      return (data || []) as AdPlatformStatAggregated[];
    },
    enabled: !!brandId && !!fromDate && !!toDate,
  });
}

export function useAdPlatformStatsTrend({ fromDate, toDate, platform, campaignId }: UseAdPlatformStatsParams) {
  const { currentBrand, isAllBrandsSelected } = useBrand();
  const brandId = isAllBrandsSelected ? "00000000-0000-0000-0000-000000000000" : currentBrand?.id;

  return useQuery({
    queryKey: ["ad-platform-stats-trend", brandId, fromDate, toDate, platform, campaignId],
    queryFn: async (): Promise<AdPlatformStatTrend[]> => {
      if (!brandId) return [];

      const { data, error } = await supabase.rpc("get_ad_platform_stats_trend", {
        p_brand_id: brandId,
        p_from: fromDate,
        p_to: toDate,
        p_platform: platform ?? null,
        p_campaign_id: campaignId ?? null,
      });

      if (error) throw error;
      return ((data || []) as unknown[]).map((row: unknown) => {
        const r = row as Record<string, unknown>;
        return {
          ...r,
          total_reach: r.total_reach ?? 0,
          leads_count: r.total_leads ?? 0,
          total_leads: r.total_leads ?? 0,
        } as AdPlatformStatTrend;
      });
    },
    enabled: !!brandId && !!fromDate && !!toDate,
  });
}

export function useAdPlatformStatsSummary({ fromDate, toDate, platform, campaignId }: UseAdPlatformStatsParams) {
  const { currentBrand, isAllBrandsSelected } = useBrand();
  const brandId = isAllBrandsSelected ? "00000000-0000-0000-0000-000000000000" : currentBrand?.id;

  return useQuery({
    queryKey: ["ad-platform-stats-summary", brandId, fromDate, toDate, platform, campaignId],
    queryFn: async (): Promise<AdPlatformStatSummary | null> => {
      if (!brandId) return null;

      const { data, error } = await supabase.rpc("get_ad_platform_stats_summary", {
        p_brand_id: brandId,
        p_from: fromDate,
        p_to: toDate,
        p_platform: platform ?? null,
        p_campaign_id: campaignId ?? null,
      });

      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (row) {
        const r = row as AdPlatformStatSummary;
        r.avg_cpl = (r.total_leads && r.total_leads > 0 && r.total_spend > 0)
          ? Math.round((r.total_spend / r.total_leads) * 100) / 100
          : null;
        return r;
      }
      return null;
    },
    enabled: !!brandId && !!fromDate && !!toDate,
  });
}
