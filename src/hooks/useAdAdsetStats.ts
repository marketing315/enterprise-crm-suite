import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import type { AdPlatform, AdAdsetStat } from "@/types/adPlatform";

interface Params {
  fromDate: string;
  toDate: string;
  platform?: AdPlatform | null;
  campaignExternalId?: string | null;
}

/**
 * Fetch Meta adset (gruppo di inserzioni) breakdown per the selected campaign.
 */
export function useAdAdsetStats({ fromDate, toDate, platform, campaignExternalId }: Params) {
  const { currentBrand, isAllBrandsSelected } = useBrand();
  const brandId = isAllBrandsSelected ? "00000000-0000-0000-0000-000000000000" : currentBrand?.id;

  return useQuery({
    queryKey: ["ad-adset-stats", brandId, fromDate, toDate, platform, campaignExternalId],
    queryFn: async (): Promise<AdAdsetStat[]> => {
      if (!brandId || !campaignExternalId) return [];
      const { data, error } = await supabase.rpc("get_ad_adset_stats", {
        p_brand_id: brandId,
        p_from: fromDate,
        p_to: toDate,
        p_platform: platform ?? null,
        p_campaign_external_id: campaignExternalId,
      });
      if (error) throw error;
      return (data || []) as AdAdsetStat[];
    },
    enabled: !!brandId && !!fromDate && !!toDate && !!campaignExternalId,
  });
}
