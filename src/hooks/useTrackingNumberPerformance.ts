/**
 * F2 — Hook performance per numero verde (CPL/CAC su DID specifico).
 * Wrap su RPC `get_tracking_number_performance(p_brand_id, p_from, p_to)`.
 * Le colonne `spend` ed `est_cpl` sono NULL per ruoli non-finance.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";

export interface TrackingNumberPerf {
  tracking_number_id: string;
  label: string;
  phone_e164: string;
  broadcaster: string | null;
  channel_name: string | null;
  campaign_name: string | null;
  calls_in: number;
  calls_answered: number;
  unique_contacts: number;
  talk_time_seconds: number;
  spend: number | null;
  est_cpl: number | null;
}

export function useTrackingNumberPerformance(from: string, to: string, refetchMs: number | false = false) {
  const { currentBrand, hasBrandSelected, isAllBrandsSelected } = useBrand();
  return useQuery({
    queryKey: ["tracking-number-performance", currentBrand?.id, from, to],
    enabled: hasBrandSelected && !isAllBrandsSelected && !!currentBrand?.id,
    refetchInterval: refetchMs,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_tracking_number_performance", {
        p_brand_id: currentBrand!.id,
        p_from: from,
        p_to: to,
      });
      if (error) throw error;
      return (data ?? []) as TrackingNumberPerf[];
    },
  });
}
