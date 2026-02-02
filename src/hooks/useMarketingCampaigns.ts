import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import { useAuth } from "@/contexts/AuthContext";
import type { MarketingCampaign, MarketingCampaignStatus } from "@/types/marketing";

interface CampaignFilters {
  status?: MarketingCampaignStatus;
  channelId?: string;
}

export function useMarketingCampaigns(filters?: CampaignFilters) {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ["marketing-campaigns", currentBrand?.id, filters],
    queryFn: async (): Promise<MarketingCampaign[]> => {
      if (!currentBrand) return [];

      let query = supabase
        .from("marketing_campaigns")
        .select(`
          *,
          marketing_channels(id, name, type)
        `)
        .eq("brand_id", currentBrand.id)
        .order("start_date", { ascending: false });

      if (filters?.status) {
        query = query.eq("status", filters.status);
      }
      if (filters?.channelId) {
        query = query.eq("channel_id", filters.channelId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data || []) as unknown as MarketingCampaign[];
    },
    enabled: !!currentBrand,
  });
}

export function useMarketingCampaign(campaignId: string | null) {
  return useQuery({
    queryKey: ["marketing-campaign", campaignId],
    queryFn: async (): Promise<MarketingCampaign | null> => {
      if (!campaignId) return null;

      const { data, error } = await supabase
        .from("marketing_campaigns")
        .select(`
          *,
          marketing_channels(id, name, type)
        `)
        .eq("id", campaignId)
        .single();

      if (error) throw error;
      return data as unknown as MarketingCampaign;
    },
    enabled: !!campaignId,
  });
}

interface CreateCampaignInput {
  name: string;
  channel_id?: string | null;
  external_id?: string | null;
  start_date: string;
  end_date?: string | null;
  planned_budget?: number | null;
  status?: MarketingCampaignStatus;
}

export function useCreateMarketingCampaign() {
  const queryClient = useQueryClient();
  const { currentBrand } = useBrand();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: CreateCampaignInput) => {
      if (!currentBrand) throw new Error("No brand selected");
      if (!user) throw new Error("User not authenticated");

      const { data, error } = await supabase
        .from("marketing_campaigns")
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
      queryClient.invalidateQueries({ queryKey: ["marketing-campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["marketing-kpis"] });
    },
  });
}

interface UpdateCampaignInput {
  id: string;
  name?: string;
  channel_id?: string | null;
  external_id?: string | null;
  start_date?: string;
  end_date?: string | null;
  planned_budget?: number | null;
  status?: MarketingCampaignStatus;
}

export function useUpdateMarketingCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: UpdateCampaignInput) => {
      const { error } = await supabase
        .from("marketing_campaigns")
        .update(updates)
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["marketing-campaign"] });
      queryClient.invalidateQueries({ queryKey: ["marketing-kpis"] });
    },
  });
}

export function useDeleteMarketingCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("marketing_campaigns")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["marketing-kpis"] });
    },
  });
}
