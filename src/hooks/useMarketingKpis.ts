import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import type { 
  MarketingCampaignKpi, 
  MarketingChannelKpi, 
  MarketingSummaryKpi 
} from "@/types/marketing";

interface KpiFilters {
  fromDate: string;
  toDate: string;
  channelId?: string;
  campaignId?: string;
}

export function useMarketingCampaignKpis(filters: KpiFilters) {
  const { currentBrand } = useBrand();
  const brandId = currentBrand?.id;
  const { fromDate, toDate, channelId, campaignId } = filters;

  return useQuery({
    // Use primitive values in queryKey for stable cache
    queryKey: [
      "marketing-kpis-campaigns",
      brandId ?? "",
      fromDate,
      toDate,
      channelId ?? "all",
      campaignId ?? "all",
    ],
    queryFn: async (): Promise<MarketingCampaignKpi[]> => {
      if (!brandId) return [];

      const { data, error } = await supabase.rpc("get_marketing_campaign_kpis", {
        p_brand_id: brandId,
        p_from: fromDate,
        p_to: toDate,
        p_channel_id: channelId || null,
        p_campaign_id: campaignId || null,
      });

      if (error) throw error;
      return (data || []) as MarketingCampaignKpi[];
    },
    enabled: !!brandId && !!fromDate && !!toDate,
  });
}

export function useMarketingChannelKpis(fromDate: string, toDate: string) {
  const { currentBrand } = useBrand();
  const brandId = currentBrand?.id;

  return useQuery({
    queryKey: ["marketing-kpis-channels", brandId ?? "", fromDate, toDate],
    queryFn: async (): Promise<MarketingChannelKpi[]> => {
      if (!brandId) return [];

      const { data, error } = await supabase.rpc("get_marketing_channel_kpis", {
        p_brand_id: brandId,
        p_from: fromDate,
        p_to: toDate,
      });

      if (error) throw error;
      return (data || []) as MarketingChannelKpi[];
    },
    enabled: !!brandId && !!fromDate && !!toDate,
  });
}

export function useMarketingSummaryKpis(fromDate: string, toDate: string) {
  const { currentBrand } = useBrand();
  const brandId = currentBrand?.id;

  return useQuery({
    queryKey: ["marketing-kpis-summary", brandId ?? "", fromDate, toDate],
    queryFn: async (): Promise<MarketingSummaryKpi | null> => {
      if (!brandId) return null;

      const { data, error } = await supabase.rpc("get_marketing_summary_kpis", {
        p_brand_id: brandId,
        p_from: fromDate,
        p_to: toDate,
      });

      if (error) throw error;
      return data?.[0] as MarketingSummaryKpi || null;
    },
    enabled: !!brandId && !!fromDate && !!toDate,
  });
}
