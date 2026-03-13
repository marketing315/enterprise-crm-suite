import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrandFilter } from "@/hooks/useBrandFilter";

export interface CplRow {
  entity_id: string | null;
  entity_name: string;
  match_type: string;
  leads_count: number;
  total_spend: number;
  cpl: number;
}

export interface AttributionSummary {
  total_leads: number;
  exact_count: number;
  group_count: number;
  unmapped_count: number;
  match_rate: number;
  overall_cpl: number;
}

export function useCplAnalytics(params: {
  from?: Date;
  to?: Date;
  groupBy?: "campaign" | "group";
}) {
  const { getBrandIds, getQueryKeyBrand, isQueryEnabled } = useBrandFilter();
  const groupBy = params.groupBy ?? "campaign";

  return useQuery({
    queryKey: [
      "cpl-analytics",
      getQueryKeyBrand(),
      params.from?.toISOString() ?? "",
      params.to?.toISOString() ?? "",
      groupBy,
    ],
    queryFn: async (): Promise<CplRow[]> => {
      const brandIds = getBrandIds();
      if (brandIds.length === 0) return [];

      const { data, error } = await supabase.rpc("get_cpl_analytics", {
        p_brand_id: brandIds[0],
        p_from: params.from?.toISOString() ?? null,
        p_to: params.to?.toISOString() ?? null,
        p_group_by: groupBy,
      });

      if (error) throw error;
      return (data || []) as unknown as CplRow[];
    },
    enabled: isQueryEnabled(),
  });
}

export function useAttributionSummary(params: {
  from?: Date;
  to?: Date;
}) {
  const { getBrandIds, getQueryKeyBrand, isQueryEnabled } = useBrandFilter();

  return useQuery({
    queryKey: [
      "attribution-summary",
      getQueryKeyBrand(),
      params.from?.toISOString() ?? "",
      params.to?.toISOString() ?? "",
    ],
    queryFn: async (): Promise<AttributionSummary | null> => {
      const brandIds = getBrandIds();
      if (brandIds.length === 0) return null;

      const { data, error } = await supabase.rpc("get_attribution_summary", {
        p_brand_id: brandIds[0],
        p_from: params.from?.toISOString() ?? null,
        p_to: params.to?.toISOString() ?? null,
      });

      if (error) throw error;
      if (!data) return null;
      // RPC returns single row
      const row = Array.isArray(data) ? data[0] : data;
      return row as unknown as AttributionSummary;
    },
    enabled: isQueryEnabled(),
  });
}
