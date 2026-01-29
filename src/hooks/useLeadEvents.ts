import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import { useAuth } from "@/contexts/AuthContext";
import { startOfDay, subDays } from "date-fns";

export type PeriodFilter = "today" | "7days" | "30days" | "all";

interface LeadEventTag {
  id: string;
  name: string;
  color: string;
  scope: string;
}

interface LeadEventContact {
  id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  status: string | null;
  primary_phone: string | null;
}

export interface LeadEventResult {
  id: string;
  brand_id: string;
  contact_id: string | null;
  deal_id: string | null;
  source: string;
  source_name: string | null;
  occurred_at: string;
  received_at: string;
  ai_priority: number | null;
  ai_confidence: number | null;
  ai_rationale: string | null;
  lead_type: string | null;
  archived: boolean;
  raw_payload: Record<string, unknown>;
  created_at: string;
  contact: LeadEventContact;
  tags: LeadEventTag[];
}

export interface SearchLeadEventsResult {
  total: number;
  limit: number;
  offset: number;
  events: LeadEventResult[];
}

interface UseLeadEventsParams {
  periodFilter?: PeriodFilter;
  sourceFilter?: string;
  sourceNameFilter?: string;
  showArchived?: boolean;
  tagIds?: string[];
  matchAllTags?: boolean;
  priorityMin?: number;
  priorityMax?: number;
  clinicalTopicIds?: string[];
  matchAllTopics?: boolean;
  limit?: number;
  offset?: number;
}

export function useLeadEvents(params: UseLeadEventsParams = {}) {
  const { currentBrand } = useBrand();
  const { isAdmin, isCeo } = useAuth();
  
  const {
    periodFilter = "7days",
    sourceFilter,
    sourceNameFilter,
    showArchived = false,
    tagIds = [],
    matchAllTags = false,
    priorityMin,
    priorityMax,
    clinicalTopicIds = [],
    matchAllTopics = false,
    limit = 100,
    offset = 0,
  } = params;

  // Only admin/ceo can see archived events
  const canSeeArchived = isAdmin || isCeo;
  const includeArchived = showArchived && canSeeArchived;

  // Calculate date range
  const getDateRange = () => {
    const now = new Date();
    
    switch (periodFilter) {
      case "today":
        return { from: startOfDay(now), to: null };
      case "7days":
        return { from: startOfDay(subDays(now, 7)), to: null };
      case "30days":
        return { from: startOfDay(subDays(now, 30)), to: null };
      case "all":
      default:
        return { from: null, to: null };
    }
  };

  return useQuery({
    queryKey: [
      "lead-events-rpc",
      currentBrand?.id,
      periodFilter,
      sourceFilter,
      sourceNameFilter,
      includeArchived,
      tagIds,
      matchAllTags,
      priorityMin,
      priorityMax,
      clinicalTopicIds,
      matchAllTopics,
      limit,
      offset,
    ],
    queryFn: async (): Promise<SearchLeadEventsResult> => {
      if (!currentBrand) {
        return { total: 0, limit, offset, events: [] };
      }

      const { from, to } = getDateRange();

      const { data, error } = await supabase.rpc("search_lead_events", {
        p_brand_id: currentBrand.id,
        p_date_from: from?.toISOString() ?? null,
        p_date_to: to?.toISOString() ?? null,
        p_source: sourceFilter && sourceFilter !== "all" ? sourceFilter : null,
        p_source_name: sourceNameFilter ?? null,
        p_include_archived: includeArchived,
        p_tag_ids: tagIds.length > 0 ? tagIds : null,
        p_match_all_tags: matchAllTags,
        p_priority_min: priorityMin ?? null,
        p_priority_max: priorityMax ?? null,
        p_clinical_topic_ids: clinicalTopicIds.length > 0 ? clinicalTopicIds : null,
        p_match_all_topics: matchAllTopics,
        p_limit: limit,
        p_offset: offset,
      });

      if (error) {
        console.error("search_lead_events error:", error);
        throw error;
      }

      // Parse the JSON result
      const result = data as unknown as SearchLeadEventsResult;
      return result;
    },
    enabled: !!currentBrand,
  });
}

// Hook for archiving/unarchiving events
export function useArchiveEvent() {
  return async (eventId: string, archived: boolean) => {
    const { error } = await supabase
      .from("lead_events")
      .update({ archived } as never)
      .eq("id", eventId);

    if (error) throw error;
  };
}
