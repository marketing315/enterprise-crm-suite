import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import { useAuth } from "@/contexts/AuthContext";
import type { MarketingCost } from "@/types/marketing";

interface CostFilters {
  campaignId?: string;
  fromDate?: string;
  toDate?: string;
}

export function useMarketingCosts(filters?: CostFilters) {
  const { currentBrand } = useBrand();
  const brandId = currentBrand?.id;
  const campaignFilter = filters?.campaignId ?? "all";
  const fromFilter = filters?.fromDate ?? "all";
  const toFilter = filters?.toDate ?? "all";

  return useQuery({
    // Use primitive values in queryKey for stable cache
    queryKey: ["marketing-costs", brandId ?? "", campaignFilter, fromFilter, toFilter],
    queryFn: async (): Promise<MarketingCost[]> => {
      if (!brandId) return [];

      let query = supabase
        .from("marketing_costs")
        .select(`
          *,
          marketing_campaigns(id, name, channel_id)
        `)
        .eq("brand_id", brandId)
        .order("cost_date", { ascending: false });

      if (filters?.campaignId) {
        query = query.eq("campaign_id", filters.campaignId);
      }
      if (filters?.fromDate) {
        query = query.gte("cost_date", filters.fromDate);
      }
      if (filters?.toDate) {
        query = query.lte("cost_date", filters.toDate);
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data || []) as unknown as MarketingCost[];
    },
    enabled: !!brandId,
  });
}

interface CreateCostInput {
  campaign_id?: string | null;
  amount: number;
  cost_date: string;
  source?: string | null;
  notes?: string | null;
}

export function useCreateMarketingCost() {
  const queryClient = useQueryClient();
  const { currentBrand } = useBrand();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: CreateCostInput) => {
      if (!currentBrand) throw new Error("No brand selected");
      if (!user) throw new Error("User not authenticated");

      const { data, error } = await supabase
        .from("marketing_costs")
        .insert({
          brand_id: currentBrand.id,
          created_by: user.id,
          ...input,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-costs"] });
      queryClient.invalidateQueries({ queryKey: ["marketing-kpis"] });
    },
  });
}

interface UpdateCostInput {
  id: string;
  campaign_id?: string | null;
  amount?: number;
  cost_date?: string;
  source?: string | null;
  notes?: string | null;
}

export function useUpdateMarketingCost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: UpdateCostInput) => {
      const { error } = await supabase
        .from("marketing_costs")
        .update(updates)
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-costs"] });
      queryClient.invalidateQueries({ queryKey: ["marketing-kpis"] });
    },
  });
}

export function useDeleteMarketingCost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("marketing_costs")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-costs"] });
      queryClient.invalidateQueries({ queryKey: ["marketing-kpis"] });
    },
  });
}
