import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { STALE, GC } from "@/lib/queryCache";
import { useMemo } from "react";
import { useBrand } from "@/contexts/BrandContext";
import type { PipelineStage, DealWithContact, DealStatus } from "@/types/database";
import { supabase } from "@/integrations/supabase/client";
import { untypedClient } from "@/integrations/supabase/untypedClient";

// Tag type for deals
interface DealTag {
  id: string;
  name: string;
  color: string;
}

// Assigned user info
interface AssignedUser {
  id: string;
  full_name: string | null;
  email: string;
}

// Marketing campaign info
interface DealCampaign {
  id: string;
  name: string;
  channel_id: string | null;
}

// Extended deal type with tags, assigned user, and campaign
export interface DealWithContactAndTags extends Omit<DealWithContact, 'assigned_user_id'> {
  tags?: DealTag[];
  assigned_user_id?: string | null;
  assigned_user?: AssignedUser | null;
  marketing_campaign_id?: string | null;
  marketing_campaign?: DealCampaign | null;
}

// Result from search_deals RPC
interface SearchDealsResult {
  total: number;
  limit: number;
  offset: number;
  deals: Array<{
    id: string;
    brand_id: string;
    contact_id: string;
    current_stage_id: string | null;
    status: DealStatus;
    value: number | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
    closed_at: string | null;
    contact: {
      id: string;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
    };
    tags: DealTag[];
  }>;
}

// System brand ID for global view
const SYSTEM_BRAND_ID = "00000000-0000-0000-0000-000000000000";

export function usePipelineStages() {
  // Pipeline stages are now global (shared across all brands)
  return useQuery({
    queryKey: ["pipeline-stages"],
    queryFn: async (): Promise<PipelineStage[]> => {
      const { data, error } = await supabase
        .from("pipeline_stages")
        .select("*")
        .eq("is_active", true)
        .order("order_index", { ascending: true });

      if (error) throw error;
      return (data || []) as unknown as PipelineStage[];
    },
    staleTime: STALE.BACKGROUND,
    gcTime: GC.LONG,
  });
}

// Extended type for global view with brand info
export interface DealWithBrand extends DealWithContactAndTags {
  brand?: { id: string; name: string; slug: string } | null;
}

export function useDeals(status?: DealStatus, filterTagIds?: string[]) {
  const { currentBrand } = useBrand();
  const isSystemBrand = currentBrand?.id === SYSTEM_BRAND_ID;

  return useQuery({
    queryKey: ["deals", currentBrand?.id, status, filterTagIds],
    queryFn: async (): Promise<DealWithBrand[]> => {
      if (!currentBrand) return [];

      // For system brand, fetch all deals across brands
      if (isSystemBrand) {
        let query = untypedClient
          .from("deals")
          .select(`
            *,
            contact:contacts(id, first_name, last_name, email),
            assigned_user:users!deals_assigned_user_id_fkey(id, full_name, email),
            marketing_campaign:marketing_campaigns!deals_marketing_campaign_id_fkey(id, name, channel_id),
            brand:brands!deals_brand_id_fkey(id, name, slug)
          `)
          .neq("brand_id", SYSTEM_BRAND_ID)
          .order("updated_at", { ascending: false })
          .limit(500);

        if (status) {
          query = query.eq("status", status);
        }

        const { data, error } = await query;
        if (error) throw error;
        return (data || []) as DealWithBrand[];
      }

      // If we have tag filters, use RPC for server-side filtering
      if (filterTagIds && filterTagIds.length > 0) {
        const { data, error } = await supabase.rpc("search_deals", {
          p_brand_id: currentBrand.id,
          p_status: status || "open",
          p_tag_ids: filterTagIds,
          p_match_all_tags: false,
          p_limit: 500,
          p_offset: 0,
        });

        if (error) throw error;
        
        const result = data as unknown as SearchDealsResult;
        return result.deals.map(d => ({
          ...d,
          assigned_user_id: null,
        })) as DealWithBrand[];
      }

      // No tag filter - use direct query (faster)
      let query = untypedClient
        .from("deals")
        .select(`
          *,
          contact:contacts(id, first_name, last_name, email),
          assigned_user:users!deals_assigned_user_id_fkey(id, full_name, email),
          marketing_campaign:marketing_campaigns!deals_marketing_campaign_id_fkey(id, name, channel_id),
          brand:brands!deals_brand_id_fkey(id, name, slug)
        `)
        .eq("brand_id", currentBrand.id)
        .order("updated_at", { ascending: false })
        .limit(500);

      if (status) {
        query = query.eq("status", status);
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data || []) as DealWithBrand[];
    },
    enabled: !!currentBrand,
  });
}

/**
 * Sprint 4a: kanban move via `move_deal_stage` RPC with optimistic version check.
 * Server raises 'STALE_DEAL' (SQLSTATE 40001) when expected_version mismatches → caller rolls back.
 */
export function useUpdateDealStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      dealId,
      stageId,
      expectedVersion,
    }: {
      dealId: string;
      stageId: string;
      dealBrandId?: string;
      expectedVersion?: number | null;
    }) => {
      const { data, error } = await untypedClient.rpc("move_deal_stage", {
        p_deal_id: dealId,
        p_stage_id: stageId,
        p_expected_version: expectedVersion ?? null,
      });
      if (error) {
        const msg = error.message || "";
        if (msg.includes("STALE_DEAL")) {
          throw new Error("STALE_DEAL");
        }
        throw error;
      }
      return Array.isArray(data) ? data[0] : data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deals"] });
    },
  });
}

export function useUpdateDealStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ dealId, status, dealBrandId }: { dealId: string; status: DealStatus; dealBrandId?: string }) => {
      const updateData: Record<string, unknown> = { status };
      
      if (status === "won" || status === "lost" || status === "closed") {
        updateData.closed_at = new Date().toISOString();
      }

      // Use dealBrandId if provided (for global view), otherwise update without brand filter
      let query = untypedClient
        .from("deals")
        .update(updateData)
        .eq("id", dealId);

      if (dealBrandId) {
        query = query.eq("brand_id", dealBrandId);
      }

      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deals"] });
    },
  });
}

export function useAssignDealToUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ dealId, userId, dealBrandId }: { dealId: string; userId: string | null; dealBrandId?: string }) => {
      let query = untypedClient
        .from("deals")
        .update({ assigned_user_id: userId })
        .eq("id", dealId);

      if (dealBrandId) {
        query = query.eq("brand_id", dealBrandId);
      }

      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      queryClient.invalidateQueries({ queryKey: ["salesperson-kpis"] });
    },
  });
}

export function useUpdateDealCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ dealId, campaignId, dealBrandId }: { dealId: string; campaignId: string | null; dealBrandId?: string }) => {
      let query = untypedClient
        .from("deals")
        .update({ marketing_campaign_id: campaignId })
        .eq("id", dealId);

      if (dealBrandId) {
        query = query.eq("brand_id", dealBrandId);
      }

      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      queryClient.invalidateQueries({ queryKey: ["marketing-kpis"] });
    },
  });
}

export function useDealStageHistory(dealId: string | null) {
  return useQuery({
    queryKey: ["deal-stage-history", dealId],
    queryFn: async () => {
      if (!dealId) return [];

      const { data, error } = await untypedClient
        .from("deal_stage_history")
        .select(`
          *,
          from_stage:pipeline_stages(id, name, color),
          to_stage:pipeline_stages(id, name, color)
        `)
        .eq("deal_id", dealId)
        .order("changed_at", { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!dealId,
  });
}
