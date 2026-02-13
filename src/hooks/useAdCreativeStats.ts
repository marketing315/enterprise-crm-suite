import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrandFilter } from "@/hooks/useBrandFilter";
import type { AdPlatform, AdCreativeStat } from "@/types/adPlatform";

interface UseAdCreativeStatsParams {
  fromDate: string;
  toDate: string;
  platform?: AdPlatform | null;
  campaignId?: string | null;
}

export function useAdCreativeStats({ fromDate, toDate, platform, campaignId }: UseAdCreativeStatsParams) {
  const { getBrandIds, getQueryKeyBrand, isQueryEnabled } = useBrandFilter();

  return useQuery({
    queryKey: ["ad-creative-stats", getQueryKeyBrand(), fromDate, toDate, platform, campaignId],
    queryFn: async (): Promise<AdCreativeStat[]> => {
      const brandIds = getBrandIds();
      if (!brandIds.length) return [];

      const { data, error } = await supabase.rpc("get_ad_creative_stats", {
        p_brand_ids: brandIds,
        p_from_date: fromDate,
        p_to_date: toDate,
        p_platform: platform ?? null,
        p_campaign_id: campaignId ?? null,
      });

      if (error) throw error;
      return (data || []) as AdCreativeStat[];
    },
    enabled: isQueryEnabled() && !!fromDate && !!toDate,
  });
}
