import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";

export interface SloMetric {
  value: number;
  target: number;
  unit: string;
  total?: number;
  success?: number;
  completed?: number;
  within_sla?: number;
  dlq?: number;
  dlq_rate?: number;
  overrides?: number;
  total_leads?: number;
  converted?: number;
  median?: number;
  closed?: number;
  direction?: "lower_is_better";
}

export interface BoardSloData {
  period: { start: string; end: string };
  engineering: {
    ingest_availability: SloMetric;
    ai_success_rate: SloMetric;
    webhook_delivery_rate: SloMetric;
  };
  cx_ops: {
    sla_compliance: SloMetric;
    mttr_hours: SloMetric;
    ai_override_rate: SloMetric;
  };
  sales_ops: {
    lead_conversion: SloMetric;
    deal_velocity: SloMetric;
  };
}

export function useBoardSloMetrics(monthStart?: string) {
  const { currentBrand, isAllBrandsSelected } = useBrand();

  return useQuery({
    queryKey: ["board-slo-metrics", currentBrand?.id, isAllBrandsSelected, monthStart],
    queryFn: async (): Promise<BoardSloData | null> => {
      const params: Record<string, unknown> = {};
      if (!isAllBrandsSelected && currentBrand?.id) {
        params.p_brand_id = currentBrand.id;
      }
      if (monthStart) {
        params.p_month_start = monthStart;
      }

      const { data, error } = await supabase.rpc(
        "get_board_slo_metrics" as never,
        params as never
      );

      if (error) throw error;
      return data as unknown as BoardSloData;
    },
    enabled: !!currentBrand?.id || isAllBrandsSelected,
    staleTime: 5 * 60 * 1000,
  });
}
