import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import type { MarketingChannel, MarketingChannelType } from "@/types/marketing";

export function useMarketingChannels() {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ["marketing-channels", currentBrand?.id],
    queryFn: async (): Promise<MarketingChannel[]> => {
      if (!currentBrand) return [];

      const { data, error } = await supabase
        .from("marketing_channels")
        .select("*")
        .eq("brand_id", currentBrand.id)
        .order("name");

      if (error) throw error;
      return (data || []) as unknown as MarketingChannel[];
    },
    enabled: !!currentBrand,
  });
}

export function useActiveMarketingChannels() {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ["marketing-channels-active", currentBrand?.id],
    queryFn: async (): Promise<MarketingChannel[]> => {
      if (!currentBrand) return [];

      const { data, error } = await supabase
        .from("marketing_channels")
        .select("*")
        .eq("brand_id", currentBrand.id)
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      return (data || []) as unknown as MarketingChannel[];
    },
    enabled: !!currentBrand,
  });
}

interface CreateChannelInput {
  name: string;
  type: MarketingChannelType;
}

export function useCreateMarketingChannel() {
  const queryClient = useQueryClient();
  const { currentBrand } = useBrand();

  return useMutation({
    mutationFn: async (input: CreateChannelInput) => {
      if (!currentBrand) throw new Error("No brand selected");

      const { data, error } = await supabase
        .from("marketing_channels")
        .insert({
          brand_id: currentBrand.id,
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
