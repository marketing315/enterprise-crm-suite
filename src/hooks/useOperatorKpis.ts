/**
 * F2 — Hook KPI operatori call center.
 * Wrap su RPC `get_operator_kpis(p_brand_id, p_from, p_to)`.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";

export interface OperatorKpi {
  user_id: string;
  full_name: string;
  calls_total: number;
  calls_inbound: number;
  calls_outbound: number;
  calls_answered: number;
  calls_missed: number;
  talk_time_seconds: number;
  avg_talk_seconds: number | null;
  avg_response_seconds: number | null;
}

export function useOperatorKpis(fromIso: string, toIso: string) {
  const { currentBrand, hasBrandSelected, isAllBrandsSelected } = useBrand();
  return useQuery({
    queryKey: ["operator-kpis", currentBrand?.id, fromIso, toIso],
    enabled: hasBrandSelected && !isAllBrandsSelected && !!currentBrand?.id,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_operator_kpis", {
        p_brand_id: currentBrand!.id,
        p_from: fromIso,
        p_to: toIso,
      });
      if (error) throw error;
      return (data ?? []) as OperatorKpi[];
    },
  });
}
