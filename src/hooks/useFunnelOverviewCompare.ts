import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";

export interface FunnelOverviewCompareStage {
  stage_id: string;
  stage_label: string;
  stage_order: number;
  metric_count: number;
  metric_value: number;
  prev_metric_count: number;
  prev_metric_value: number;
  delta_pct: number | null;
  conversion_from_prev: number | null;
  drop_off_pct: number | null;
}

export function useFunnelOverviewCompare(
  fromIso: string,
  toIso: string,
  compareFromIso: string | null,
  compareToIso: string | null,
  sources?: string[]
) {
  const { currentBrand } = useBrand();
  const brandId = currentBrand?.id;
  const enabled = !!brandId && !!fromIso && !!toIso && !!compareFromIso && !!compareToIso;

  return useQuery({
    queryKey: [
      "funnel-overview-compare",
      brandId ?? "",
      fromIso,
      toIso,
      compareFromIso ?? "",
      compareToIso ?? "",
      sources?.join(",") ?? "all",
    ],
    queryFn: async (): Promise<FunnelOverviewCompareStage[]> => {
      if (!brandId || !compareFromIso || !compareToIso) return [];
      const { data, error } = await supabase.rpc("get_funnel_overview_compare" as never, {
        p_brand_ids: [brandId],
        p_from: fromIso,
        p_to: toIso,
        p_compare_from: compareFromIso,
        p_compare_to: compareToIso,
        p_sources: sources && sources.length ? sources : null,
      } as never);
      if (error) throw error;
      return ((data as unknown) as FunnelOverviewCompareStage[]) ?? [];
    },
    enabled,
    staleTime: 60_000,
  });
}
