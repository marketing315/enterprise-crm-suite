import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrandFilter } from "@/hooks/useBrandFilter";
import { useWriteBrandId } from "@/hooks/useWriteBrandId";

export interface CampaignGroupMatchRules {
  source_names?: string[];
  channel_ids?: string[];
  tags?: string[];
}

export interface CampaignGroup {
  id: string;
  brand_id: string;
  name: string;
  priority: number;
  match_rules: CampaignGroupMatchRules;
  campaign_ids: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useCampaignGroups() {
  const { getBrandIds, getQueryKeyBrand, isQueryEnabled } = useBrandFilter();

  return useQuery({
    queryKey: ["campaign-groups", getQueryKeyBrand()],
    queryFn: async (): Promise<CampaignGroup[]> => {
      const brandIds = getBrandIds();
      if (brandIds.length === 0) return [];

      let query = supabase
        .from("marketing_campaign_groups")
        .select("*")
        .order("priority", { ascending: false });

      if (brandIds.length === 1) {
        query = query.eq("brand_id", brandIds[0]);
      } else {
        query = query.in("brand_id", brandIds);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as CampaignGroup[];
    },
    enabled: isQueryEnabled(),
  });
}

interface CreateGroupInput {
  name: string;
  priority?: number;
  match_rules: CampaignGroupMatchRules;
  campaign_ids?: string[];
  is_active?: boolean;
}

export function useCreateCampaignGroup() {
  const queryClient = useQueryClient();
  const { getWriteBrandId } = useWriteBrandId();

  return useMutation({
    mutationFn: async (input: CreateGroupInput) => {
      const brandId = getWriteBrandId();
      const { data, error } = await supabase
        .from("marketing_campaign_groups")
        .insert({
          brand_id: brandId,
          name: input.name,
          priority: input.priority ?? 0,
          match_rules: input.match_rules as any,
          campaign_ids: input.campaign_ids ?? [],
          is_active: input.is_active ?? true,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-groups"] });
    },
  });
}

interface UpdateGroupInput {
  id: string;
  name?: string;
  priority?: number;
  match_rules?: CampaignGroupMatchRules;
  campaign_ids?: string[];
  is_active?: boolean;
}

export function useUpdateCampaignGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: UpdateGroupInput) => {
      const payload: Record<string, unknown> = {};
      if (updates.name !== undefined) payload.name = updates.name;
      if (updates.priority !== undefined) payload.priority = updates.priority;
      if (updates.match_rules !== undefined) payload.match_rules = updates.match_rules;
      if (updates.campaign_ids !== undefined) payload.campaign_ids = updates.campaign_ids;
      if (updates.is_active !== undefined) payload.is_active = updates.is_active;

      const { error } = await supabase
        .from("marketing_campaign_groups")
        .update(payload)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-groups"] });
    },
  });
}

export function useDeleteCampaignGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("marketing_campaign_groups")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-groups"] });
    },
  });
}
