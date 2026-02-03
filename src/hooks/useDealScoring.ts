import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import type { DealScore, DealScoreFactor, DealRiskLevel } from "@/types/predictive";

export function useDealScore(dealId: string | undefined) {
  return useQuery({
    queryKey: ["deal-score", dealId],
    queryFn: async (): Promise<DealScore | null> => {
      if (!dealId) return null;

      const { data, error } = await supabase
        .from("deal_scores")
        .select("*")
        .eq("deal_id", dealId)
        .order("calculated_at", { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== "PGRST116") throw error;
      if (!data) return null;

      return {
        ...data,
        risk_level: data.risk_level as DealRiskLevel,
        factors: (data.factors as unknown as DealScoreFactor[]) || [],
      };
    },
    enabled: !!dealId,
  });
}

export function useDealScoreHistory(dealId: string | undefined, days = 30) {
  return useQuery({
    queryKey: ["deal-score-history", dealId, days],
    queryFn: async (): Promise<DealScore[]> => {
      if (!dealId) return [];

      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - days);

      const { data, error } = await supabase
        .from("deal_scores")
        .select("*")
        .eq("deal_id", dealId)
        .gte("score_date", fromDate.toISOString().split("T")[0])
        .order("score_date", { ascending: true });

      if (error) throw error;

      return (data || []).map(d => ({
        ...d,
        risk_level: d.risk_level as DealRiskLevel,
        factors: (d.factors as unknown as DealScoreFactor[]) || [],
      }));
    },
    enabled: !!dealId,
  });
}

export function useRecalculateDealScores() {
  const { currentBrand } = useBrand();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (brandId?: string) => {
      const targetBrand = brandId || currentBrand?.id;

      const { data, error } = await supabase.rpc("calculate_deal_scores", {
        p_brand_id: targetBrand || null,
      });

      if (error) throw error;
      return data as number;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deal-score"] });
      queryClient.invalidateQueries({ queryKey: ["deals"] });
    },
  });
}

export function useBrandDealScores() {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ["brand-deal-scores", currentBrand?.id],
    queryFn: async () => {
      if (!currentBrand) return { low: 0, medium: 0, high: 0, critical: 0 };

      const { data, error } = await supabase
        .from("deals")
        .select("deal_risk_level")
        .eq("brand_id", currentBrand.id)
        .eq("status", "open")
        .not("deal_risk_level", "is", null);

      if (error) throw error;

      const counts = { low: 0, medium: 0, high: 0, critical: 0 };
      (data || []).forEach(d => {
        if (d.deal_risk_level && d.deal_risk_level in counts) {
          counts[d.deal_risk_level as keyof typeof counts]++;
        }
      });

      return counts;
    },
    enabled: !!currentBrand,
  });
}
