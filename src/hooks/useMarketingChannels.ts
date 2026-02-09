import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWriteBrandId } from "@/hooks/useWriteBrandId";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import type { MarketingChannel, MarketingChannelType } from "@/types/marketing";

export function useMarketingChannels() {
  const { currentBrand, isAllBrandsSelected, allBrandIds } = useBrand();

  return useQuery({
    queryKey: ["marketing-channels", isAllBrandsSelected ? "all" : currentBrand?.id],
    queryFn: async (): Promise<MarketingChannel[]> => {
      if (!isAllBrandsSelected && !currentBrand) return [];
      if (isAllBrandsSelected && allBrandIds.length === 0) return [];

      let query = supabase
        .from("marketing_channels")
        .select("*")
        .order("name");

      if (isAllBrandsSelected) {
        query = query.in("brand_id", allBrandIds);
      } else {
        query = query.eq("brand_id", currentBrand!.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as MarketingChannel[];
    },
    enabled: isAllBrandsSelected ? allBrandIds.length > 0 : !!currentBrand,
  });
}

export function useActiveMarketingChannels() {
  const { currentBrand, isAllBrandsSelected, allBrandIds } = useBrand();

  return useQuery({
    queryKey: ["marketing-channels-active", isAllBrandsSelected ? "all" : currentBrand?.id],
    queryFn: async (): Promise<MarketingChannel[]> => {
      if (!isAllBrandsSelected && !currentBrand) return [];
      if (isAllBrandsSelected && allBrandIds.length === 0) return [];

      let query = supabase
        .from("marketing_channels")
        .select("*")
        .eq("is_active", true)
        .order("name");

      if (isAllBrandsSelected) {
        query = query.in("brand_id", allBrandIds);
      } else {
        query = query.eq("brand_id", currentBrand!.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as MarketingChannel[];
    },
    enabled: isAllBrandsSelected ? allBrandIds.length > 0 : !!currentBrand,
  });
}

interface CreateChannelInput {
  name: string;
  type: MarketingChannelType;
}

export function useCreateMarketingChannel() {
  const queryClient = useQueryClient();
  const { getWriteBrandId } = useWriteBrandId();

  return useMutation({
    mutationFn: async (input: CreateChannelInput) => {
      const brandId = getWriteBrandId();

      const { data, error } = await supabase
        .from("marketing_channels")
        .insert({
          brand_id: brandId,
          name: input.name,
          type: input.type,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-channels"] });
    },
  });
}

interface UpdateChannelInput {
  id: string;
  name?: string;
  type?: MarketingChannelType;
  is_active?: boolean;
}

export function useUpdateMarketingChannel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: UpdateChannelInput) => {
      const { error } = await supabase
        .from("marketing_channels")
        .update(updates)
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-channels"] });
    },
  });
}

export function useDeleteMarketingChannel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("marketing_channels")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-channels"] });
    },
  });
}
