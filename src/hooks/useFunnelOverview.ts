import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand, SYSTEM_BRAND_ID } from "@/contexts/BrandContext";

export interface FunnelOverviewStage {
  stage_id: string;
  stage_label: string;
  stage_order: number;
  metric_count: number;
  metric_value: number;
  conversion_from_prev: number | null;
  drop_off_pct: number | null;
}

export function useFunnelOverview(
  fromIso: string,
  toIso: string,
  sources?: string[]
) {
  const { currentBrand } = useBrand();
  const brandId = currentBrand?.id;

  return useQuery({
    queryKey: ["funnel-overview", brandId ?? "", fromIso, toIso, sources?.join(",") ?? "all"],
    queryFn: async (): Promise<FunnelOverviewStage[]> => {
      if (!brandId) return [];
      const brandIds = [brandId];
      const { data, error } = await supabase.rpc("get_funnel_overview" as never, {
        p_brand_ids: brandIds,
        p_from: fromIso,
        p_to: toIso,
        p_sources: sources && sources.length ? sources : null,
      } as never);
      if (error) throw error;
      return ((data as unknown) as FunnelOverviewStage[]) ?? [];
    },
    enabled: !!brandId && !!fromIso && !!toIso,
    staleTime: 60_000,
  });
}

export const FUNNEL_OVERVIEW_SYSTEM_BRAND_ID = SYSTEM_BRAND_ID;
