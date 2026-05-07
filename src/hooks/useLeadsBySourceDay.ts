import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";

export type LeadHistogramGranularity = "hour" | "day" | "week";

export interface LeadsBySourceBucket {
  bucket: string; // ISO timestamp
  source: string;
  lead_count: number;
  source_total: number;
}

export function useLeadsBySourceDay(
  fromIso: string,
  toIso: string,
  granularity: LeadHistogramGranularity = "day"
) {
  const { currentBrand } = useBrand();
  const brandId = currentBrand?.id;
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["leads-by-source-day", brandId ?? "", fromIso, toIso, granularity],
    queryFn: async (): Promise<LeadsBySourceBucket[]> => {
      if (!brandId) return [];
      const { data, error } = await supabase.rpc("get_leads_by_source_day" as never, {
        p_brand_ids: [brandId],
        p_from: fromIso,
        p_to: toIso,
        p_granularity: granularity,
      } as never);
      if (error) throw error;
      return ((data as unknown) as LeadsBySourceBucket[]) ?? [];
    },
    enabled: !!brandId && !!fromIso && !!toIso,
    staleTime: 30_000,
  });

  // Realtime: invalidate on lead_events insert for current brand
  useEffect(() => {
    if (!brandId) return;
    const ch = supabase
      .channel(`leads-histogram-${brandId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "lead_events", filter: `brand_id=eq.${brandId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["leads-by-source-day", brandId] });
          queryClient.invalidateQueries({ queryKey: ["funnel-overview", brandId] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [brandId, queryClient]);

  return query;
}
