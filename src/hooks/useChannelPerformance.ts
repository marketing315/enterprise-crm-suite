/**
 * F1 — RPC get_channel_performance
 * Restituisce KPI per canale (leads / spend / CPL / deals / won / revenue / CAC / ROI)
 * filtrabili per periodo e source filter (vedi SourceFilterSchema).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import { useHasMarketingAccess } from "@/hooks/useMarketingAccess";
import type { SourceFilter } from "@/components/shared/SourceFilterBar";

export interface ChannelPerformanceRow {
  channel_id: string;
  channel_name: string;
  channel_type: string;
  category: string;
  leads_count: number;
  spend: number;
  cpl: number | null;
  deals_count: number;
  deals_won: number;
  revenue: number;
  cac: number | null;
  roi: number | null;
}

export function useChannelPerformance(params: {
  from: string;
  to: string;
  sourceFilter?: SourceFilter;
}) {
  const { currentBrand, isAllBrandsSelected } = useBrand();
  const hasAccess = useHasMarketingAccess();
  const brandId = currentBrand?.id;

  return useQuery({
    queryKey: [
      "channel-performance",
      brandId ?? "",
      params.from,
      params.to,
      params.sourceFilter ?? {},
    ],
    queryFn: async (): Promise<ChannelPerformanceRow[]> => {
      if (!brandId) return [];
      const { data, error } = await supabase.rpc("get_channel_performance" as never, {
        p_brand_id: brandId,
        p_from: params.from,
        p_to: params.to,
        p_source_filter: (params.sourceFilter ?? {}) as never,
      } as never);
      if (error) throw error;
      return (data ?? []) as ChannelPerformanceRow[];
    },
    enabled: !!brandId && !isAllBrandsSelected && hasAccess,
    staleTime: 60_000,
  });
}
