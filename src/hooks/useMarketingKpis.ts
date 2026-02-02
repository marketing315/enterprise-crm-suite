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

  return useQuery({
    queryKey: ["marketing-kpis-campaigns", currentBrand?.id, filters],
    queryFn: async (): Promise<MarketingCampaignKpi[]> => {
      if (!currentBrand) return [];

      const { data, error } = await supabase.rpc("get_marketing_campaign_kpis", {
        p_brand_id: currentBrand.id,
        p_from: filters.fromDate,
        p_to: filters.toDate,
        p_channel_id: filters.channelId || null,
        p_campaign_id: filters.campaignId || null,
      });

      if (error) throw error;
      return (data || []) as MarketingCampaignKpi[];
    },
    enabled: !!currentBrand && !!filters.fromDate && !!filters.toDate,
  });
}

export function useMarketingChannelKpis(fromDate: string, toDate: string) {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ["marketing-kpis-channels", currentBrand?.id, fromDate, toDate],
    queryFn: async (): Promise<MarketingChannelKpi[]> => {
      if (!currentBrand) return [];

      const { data, error } = await supabase.rpc("get_marketing_channel_kpis", {
        p_brand_id: currentBrand.id,
        p_from: fromDate,
        p_to: toDate,
      });

      if (error) throw error;
      return (data || []) as MarketingChannelKpi[];
    },
    enabled: !!currentBrand && !!fromDate && !!toDate,
  });
}

export function useMarketingSummaryKpis(fromDate: string, toDate: string) {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ["marketing-kpis-summary", currentBrand?.id, fromDate, toDate],
    queryFn: async (): Promise<MarketingSummaryKpi | null> => {
      if (!currentBrand) return null;

      const { data, error } = await supabase.rpc("get_marketing_summary_kpis", {
        p_brand_id: currentBrand.id,
        p_from: fromDate,
        p_to: toDate,
      });

      if (error) throw error;
      return data?.[0] as MarketingSummaryKpi || null;
    },
    enabled: !!currentBrand && !!fromDate && !!toDate,
  });
}
