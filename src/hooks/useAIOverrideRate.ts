import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";

export interface AIOverrideSummary {
  period_days: number;
  brand_id: string | null;
  decisions: {
    total: number;
    overridden: number;
    override_rate_pct: number | null;
    avg_confidence: number | null;
    avg_confidence_when_overridden: number | null;
    top_override_categories: Array<{ category: string; cnt: number }>;
  };
  proposals: {
    total: number;
    approved: number;
    rejected: number;
    edited: number;
    approval_rate_pct: number | null;
  };
  generated_at: string;
}

export function useAIOverrideSummary(days = 30) {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ["ai-override-summary", currentBrand?.id, days],
    queryFn: async (): Promise<AIOverrideSummary | null> => {
      if (!currentBrand) return null;
      const { data, error } = await supabase.rpc("get_ai_override_summary", {
        p_brand_id: currentBrand.id,
        p_days: days,
      });
      if (error) throw error;
      return data as unknown as AIOverrideSummary;
    },
    enabled: !!currentBrand,
    staleTime: 60_000,
  });
}

export function useAIOverrideRateDaily(days = 30) {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ["ai-override-rate-daily", currentBrand?.id, days],
    queryFn: async () => {
      if (!currentBrand) return [];
      const { data, error } = await supabase
        .from("v_ai_override_rate_30d" as never)
        .select("*")
        .eq("brand_id", currentBrand.id)
        .order("day", { ascending: true })
        .limit(60);
      if (error) throw error;
      return (data as unknown as Array<{
        day: string;
        total_decisions: number;
        overridden_decisions: number;
        override_rate_pct: number | null;
        avg_confidence: number | null;
      }>) ?? [];
    },
    enabled: !!currentBrand,
    staleTime: 60_000,
  });
}
