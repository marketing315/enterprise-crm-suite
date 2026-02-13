import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrandFilter } from "@/hooks/useBrandFilter";
import type { AdPlatform } from "@/types/adPlatform";

export interface AdDemographicStat {
  age_range: string;
  gender: string;
  total_spend: number;
  total_impressions: number;
  total_clicks: number;
  total_reach: number;
  ctr: number | null;
  cpc: number | null;
}

interface UseAdDemographicsParams {
  fromDate: string;
  toDate: string;
  platform?: AdPlatform | null;
  campaignId?: string | null;
}

export function useAdDemographics({ fromDate, toDate, platform, campaignId }: UseAdDemographicsParams) {
  const { getBrandIds, getQueryKeyBrand, isQueryEnabled } = useBrandFilter();

  return useQuery({
    queryKey: ["ad-demographics", getQueryKeyBrand(), fromDate, toDate, platform, campaignId],
    queryFn: async (): Promise<AdDemographicStat[]> => {
      const brandIds = getBrandIds();
      if (!brandIds.length) return [];

      const { data, error } = await supabase.rpc("get_ad_demographics", {
        p_brand_ids: brandIds,
        p_from_date: fromDate,
        p_to_date: toDate,
        p_platform: platform ?? null,
        p_campaign_id: campaignId ?? null,
      });

      if (error) throw error;
      return (data || []) as AdDemographicStat[];
    },
    enabled: isQueryEnabled() && !!fromDate && !!toDate,
  });
}
