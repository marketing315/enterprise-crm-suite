import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";

export interface FunnelDrillItem {
  item_id: string;
  item_label: string;
  item_subtitle: string | null;
  item_value: number | null;
  item_at: string;
}

export function useFunnelStageDrill(
  stageId: string | null,
  fromIso: string,
  toIso: string,
  enabled: boolean
) {
  const { currentBrand } = useBrand();
  const brandId = currentBrand?.id;

  return useQuery({
    queryKey: ["funnel-stage-drill", brandId ?? "", stageId ?? "", fromIso, toIso],
    queryFn: async (): Promise<FunnelDrillItem[]> => {
      if (!brandId || !stageId) return [];
      const { data, error } = await supabase.rpc("get_funnel_stage_drill" as never, {
        p_brand_ids: [brandId],
        p_stage_id: stageId,
        p_from: fromIso,
        p_to: toIso,
        p_limit: 50,
      } as never);
      if (error) throw error;
      return ((data as unknown) as FunnelDrillItem[]) ?? [];
    },
    enabled: enabled && !!brandId && !!stageId,
    staleTime: 30_000,
  });
}
