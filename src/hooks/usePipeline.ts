import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import { useBrand } from "@/contexts/BrandContext";
import type { PipelineStage, DealWithContact, DealStatus } from "@/types/database";

// Untyped client for new tables not yet in generated types
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const untypedClient = createClient(supabaseUrl, supabaseKey);

// Typed client for existing tables
import { supabase } from "@/integrations/supabase/client";

// Tag type for deals
interface DealTag {
  id: string;
  name: string;
  color: string;
}

// Extended deal type with tags
export interface DealWithContactAndTags extends DealWithContact {
  tags?: DealTag[];
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

export function usePipelineStages() {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ["pipeline-stages", currentBrand?.id],
    queryFn: async (): Promise<PipelineStage[]> => {
      if (!currentBrand) return [];

      const { data, error } = await supabase
        .from("pipeline_stages")
        .select("*")
        .eq("brand_id", currentBrand.id)
        .eq("is_active", true)
        .order("order_index", { ascending: true });

      if (error) throw error;
      return (data || []) as unknown as PipelineStage[];
    },
    enabled: !!currentBrand,
  });
}

export function useDeals(status?: DealStatus, filterTagIds?: string[]) {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ["deals", currentBrand?.id, status, filterTagIds],
    queryFn: async (): Promise<DealWithContactAndTags[]> => {
      if (!currentBrand) return [];

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
        })) as DealWithContactAndTags[];
      }

      // No tag filter - use direct query (faster)
      let query = untypedClient
        .from("deals")
        .select(`
          *,
          contact:contacts(id, first_name, last_name, email)
        `)
        .eq("brand_id", currentBrand.id)
        .order("updated_at", { ascending: false });

      if (status) {
        query = query.eq("status", status);
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data || []) as DealWithContactAndTags[];
    },
    enabled: !!currentBrand,
  });
}

export function useUpdateDealStage() {
  const queryClient = useQueryClient();
  const { currentBrand } = useBrand();

  return useMutation({
    mutationFn: async ({ dealId, stageId }: { dealId: string; stageId: string }) => {
      const { error } = await untypedClient
        .from("deals")
        .update({ current_stage_id: stageId })
        .eq("id", dealId)
        .eq("brand_id", currentBrand?.id || "");

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deals"] });
    },
  });
}

export function useUpdateDealStatus() {
  const queryClient = useQueryClient();
  const { currentBrand } = useBrand();

  return useMutation({
    mutationFn: async ({ dealId, status }: { dealId: string; status: DealStatus }) => {
      const updateData: Record<string, unknown> = { status };
      
      if (status === "won" || status === "lost" || status === "closed") {
        updateData.closed_at = new Date().toISOString();
      }

      const { error } = await untypedClient
        .from("deals")
        .update(updateData)
        .eq("id", dealId)
        .eq("brand_id", currentBrand?.id || "");

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deals"] });
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
