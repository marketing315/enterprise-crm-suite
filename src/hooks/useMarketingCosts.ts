import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWriteBrandId } from "@/hooks/useWriteBrandId";
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
  const { currentBrand, isAllBrandsSelected, allBrandIds } = useBrand();
  const brandId = currentBrand?.id;
  const campaignFilter = filters?.campaignId ?? "all";
  const fromFilter = filters?.fromDate ?? "all";
  const toFilter = filters?.toDate ?? "all";

  return useQuery({
    queryKey: ["marketing-costs", isAllBrandsSelected ? "all" : (brandId ?? ""), campaignFilter, fromFilter, toFilter],
    queryFn: async (): Promise<MarketingCost[]> => {
      if (!isAllBrandsSelected && !brandId) return [];
      if (isAllBrandsSelected && allBrandIds.length === 0) return [];

      let query = supabase
        .from("marketing_costs")
        .select(`
          *,
          marketing_campaigns(id, name, channel_id)
        `)
        .order("cost_date", { ascending: false });

      // Apply brand filter
      if (isAllBrandsSelected) {
        query = query.in("brand_id", allBrandIds);
      } else {
        query = query.eq("brand_id", brandId!);
      }

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
    enabled: isAllBrandsSelected ? allBrandIds.length > 0 : !!brandId,
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
  const { getWriteBrandId } = useWriteBrandId();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: CreateCostInput) => {
      const brandId = getWriteBrandId();
      if (!user) throw new Error("User not authenticated");

      const { data, error } = await supabase
        .from("marketing_costs")
        .insert({
          brand_id: brandId,
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
