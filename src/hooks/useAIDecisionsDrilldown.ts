import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";

export interface AIDecisionRow {
  id: string;
  brand_id: string;
  brand_name: string | null;
  lead_event_id: string;
  lead_type: string;
  priority: number;
  initial_stage_name: string | null;
  model_version: string;
  prompt_version: string;
  confidence: number | null;
  was_overridden: boolean;
  override_reason: string | null;
  override_reason_category: string | null;
  overridden_at: string | null;
  overridden_by_user_id: string | null;
  overridden_by_name: string | null;
  tags_to_apply: string[];
  should_create_ticket: boolean;
  should_create_or_update_appointment: boolean;
  appointment_action: string | null;
  rationale: string;
  created_at: string;
}

export interface AIDecisionsDrilldown {
  total: number;
  limit: number;
  offset: number;
  rows: AIDecisionRow[];
  generated_at: string;
}

export interface AIDecisionsFilters {
  days: number;
  modelVersion?: string | null;
  initialStage?: string | null;
  overriddenByUserId?: string | null;
  onlyOverridden?: boolean | null;
  limit?: number;
  offset?: number;
}

export function useAIDecisionsDrilldown(filters: AIDecisionsFilters) {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: [
      "ai-decisions-drilldown",
      currentBrand?.id,
      filters.days,
      filters.modelVersion ?? null,
      filters.initialStage ?? null,
      filters.overriddenByUserId ?? null,
      filters.onlyOverridden ?? null,
      filters.limit ?? 50,
      filters.offset ?? 0,
    ],
    enabled: !!currentBrand,
    queryFn: async (): Promise<AIDecisionsDrilldown> => {
      const { data, error } = await supabase.rpc("get_ai_decisions_drilldown", {
        p_brand_id: currentBrand!.id,
        p_days: filters.days,
        p_model_version: filters.modelVersion ?? null,
        p_initial_stage: filters.initialStage ?? null,
        p_overridden_by_user_id: filters.overriddenByUserId ?? null,
        p_only_overridden: filters.onlyOverridden ?? null,
        p_limit: filters.limit ?? 50,
        p_offset: filters.offset ?? 0,
      });
      if (error) throw error;
      return data as unknown as AIDecisionsDrilldown;
    },
    staleTime: 30_000,
  });
}

export function useAIDecisionsFilterOptions(days = 30) {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ["ai-decisions-filter-options", currentBrand?.id, days],
    enabled: !!currentBrand,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_ai_decisions_filter_options", {
        p_brand_id: currentBrand!.id,
        p_days: days,
      });
      if (error) throw error;
      return data as unknown as {
        models: string[];
        stages: string[];
        users: Array<{ id: string; name: string }>;
      };
    },
    staleTime: 5 * 60_000,
  });
}
