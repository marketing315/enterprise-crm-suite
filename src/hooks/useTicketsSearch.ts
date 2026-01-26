import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import { TicketWithRelations, TicketStatus } from "./useTickets";
import { useBrandSettings } from "./useBrandSettings";
import { useBrandOperators } from "./useBrandOperators";
import { useAuth } from "@/contexts/AuthContext";

export type QueueTab = "all" | "my_queue" | "unassigned" | "sla_breached";
export type AssignmentTypeFilter = "all" | "auto" | "manual";

export interface TicketSearchParams {
  queueTab: QueueTab;
  searchQuery?: string;
  tagIds?: string[];
  assignmentType?: AssignmentTypeFilter;
  statuses?: TicketStatus[];
  limit?: number;
  offset?: number;
}

export interface TicketSearchResult {
  tickets: TicketWithRelations[];
  totalCount: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface QueueCounts {
  all: number;
  my_queue: number;
  unassigned: number;
  sla_breached: number;
  auto_count: number;
  manual_count: number;
}

/**
 * Server-side ticket search with filtering, pagination, and smart sorting
 */
export function useTicketsSearch(params: TicketSearchParams) {
  const { currentBrand } = useBrand();
  const { supabaseUser } = useAuth();
  const { data: brandSettings } = useBrandSettings();
  const { data: operators = [] } = useBrandOperators();

  // Get current user's operator ID
  const currentOperator = operators.find(
    (op) => op.supabase_auth_id === supabaseUser?.id
  );

  const slaThresholds = brandSettings?.sla_thresholds_minutes;

  return useQuery({
    queryKey: [
      "tickets-search",
      currentBrand?.id,
      params.queueTab,
      params.searchQuery,
      params.tagIds,
      params.assignmentType,
      params.statuses,
      params.limit,
      params.offset,
      currentOperator?.user_id,
      slaThresholds,
    ],
    queryFn: async (): Promise<TicketSearchResult> => {
      if (!currentBrand?.id) {
        return { tickets: [], totalCount: 0, limit: 50, offset: 0, hasMore: false };
      }

      const { data, error } = await supabase.rpc("search_tickets_v1", {
        p_brand_id: currentBrand.id,
        p_queue_tab: params.queueTab,
        p_current_user_id: currentOperator?.user_id ?? null,
        p_search_query: params.searchQuery || null,
        p_tag_ids: params.tagIds?.length ? params.tagIds : null,
        p_assignment_type: params.assignmentType || "all",
        p_statuses: params.statuses?.length ? params.statuses : null,
        p_sla_thresholds: slaThresholds ? JSON.stringify(slaThresholds) : null,
        p_limit: params.limit ?? 50,
        p_offset: params.offset ?? 0,
      });

      if (error) throw error;

      // Parse the JSON response
      const result = data as unknown as {
        tickets: TicketWithRelations[];
        total_count: number;
        limit: number;
        offset: number;
        has_more: boolean;
      };

      return {
        tickets: result.tickets || [],
        totalCount: result.total_count || 0,
        limit: result.limit,
        offset: result.offset,
        hasMore: result.has_more,
      };
    },
    enabled: !!currentBrand?.id,
    staleTime: 30000, // 30 seconds
  });
}

export interface QueueCountsParams {
  queueTab?: QueueTab;
  tagIds?: string[];
}

/**
 * Lightweight hook to get queue counts for tabs + contextual auto/manual counts
 */
export function useTicketQueueCounts(params?: QueueCountsParams) {
  const { currentBrand } = useBrand();
  const { supabaseUser } = useAuth();
  const { data: brandSettings } = useBrandSettings();
  const { data: operators = [] } = useBrandOperators();

  const currentOperator = operators.find(
    (op) => op.supabase_auth_id === supabaseUser?.id
  );

  const slaThresholds = brandSettings?.sla_thresholds_minutes;

  return useQuery({
    queryKey: [
      "ticket-queue-counts",
      currentBrand?.id,
      currentOperator?.user_id,
      slaThresholds,
      params?.queueTab,
      params?.tagIds,
    ],
    queryFn: async (): Promise<QueueCounts> => {
      if (!currentBrand?.id) {
        return { all: 0, my_queue: 0, unassigned: 0, sla_breached: 0, auto_count: 0, manual_count: 0 };
      }

      const { data, error } = await supabase.rpc("get_ticket_queue_counts", {
        p_brand_id: currentBrand.id,
        p_current_user_id: currentOperator?.user_id ?? null,
        p_sla_thresholds: slaThresholds ? JSON.stringify(slaThresholds) : null,
        p_queue_tab: params?.queueTab || "all",
        p_tag_ids: params?.tagIds?.length ? params.tagIds : null,
      });

      if (error) throw error;

      return data as unknown as QueueCounts;
    },
    enabled: !!currentBrand?.id,
    staleTime: 10000, // 10 seconds - counts refresh more frequently
  });
}
