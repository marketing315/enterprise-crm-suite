import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";

// Types for analytics data
export interface FunnelStage {
  stage_id: string;
  stage_name: string;
  stage_color: string;
  deals_entered: number;
  deals_exited_to_next: number;
  deals_won: number;
  deals_lost: number;
  conversion_rate: number;
  avg_days_in_stage: number;
}

export interface FunnelAnalytics {
  stages: FunnelStage[];
  total_deals: number;
  overall_win_rate: number;
  avg_deal_velocity_days: number;
  total_pipeline_value: number;
}

export interface LeadSourceMetrics {
  source: string;
  source_name: string;
  leads_count: number;
  deals_created: number;
  deals_won: number;
  total_value_won: number;
  unique_contacts: number;
  conversion_rate: number;
  avg_deal_value: number;
}

export interface SourceAnalytics {
  sources: LeadSourceMetrics[];
  total_leads: number;
  total_deals_won: number;
  total_revenue: number;
}

export interface WeeklyTrend {
  week_start: string;
  deals_created: number;
  deals_won: number;
}

export interface VelocityMetrics {
  avg_days_to_win: number;
  avg_days_to_lose: number;
  deals_won_count: number;
  deals_lost_count: number;
  new_deals_count: number;
  avg_won_value: number;
  total_won_value: number;
  weekly_trend: WeeklyTrend[];
}

interface UseAdvancedAnalyticsParams {
  from?: Date;
  to?: Date;
}

export function useAdvancedAnalytics({ from, to }: UseAdvancedAnalyticsParams = {}) {
  const { currentBrand } = useBrand();
  
  const fromDate = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const toDate = to || new Date();

  const funnelQuery = useQuery({
    queryKey: ["analytics", "funnel", currentBrand?.id, fromDate.toISOString(), toDate.toISOString()],
    queryFn: async (): Promise<FunnelAnalytics> => {
      if (!currentBrand?.id) throw new Error("No brand selected");
      
      const { data, error } = await supabase.rpc("get_pipeline_funnel_analytics", {
        p_brand_id: currentBrand.id,
        p_from: fromDate.toISOString(),
        p_to: toDate.toISOString(),
      });

      if (error) throw error;
      return data as unknown as FunnelAnalytics;
    },
    enabled: !!currentBrand?.id,
  });

  const sourceQuery = useQuery({
    queryKey: ["analytics", "sources", currentBrand?.id, fromDate.toISOString(), toDate.toISOString()],
    queryFn: async (): Promise<SourceAnalytics> => {
      if (!currentBrand?.id) throw new Error("No brand selected");
      
      const { data, error } = await supabase.rpc("get_lead_source_analytics", {
        p_brand_id: currentBrand.id,
        p_from: fromDate.toISOString(),
        p_to: toDate.toISOString(),
      });

      if (error) throw error;
      return data as unknown as SourceAnalytics;
    },
    enabled: !!currentBrand?.id,
  });

  const velocityQuery = useQuery({
    queryKey: ["analytics", "velocity", currentBrand?.id, fromDate.toISOString(), toDate.toISOString()],
    queryFn: async (): Promise<VelocityMetrics> => {
      if (!currentBrand?.id) throw new Error("No brand selected");
      
      const { data, error } = await supabase.rpc("get_deal_velocity_metrics", {
        p_brand_id: currentBrand.id,
        p_from: fromDate.toISOString(),
        p_to: toDate.toISOString(),
      });

      if (error) throw error;
      return data as unknown as VelocityMetrics;
    },
    enabled: !!currentBrand?.id,
  });

  return {
    funnel: funnelQuery.data,
    sources: sourceQuery.data,
    velocity: velocityQuery.data,
    isLoading: funnelQuery.isLoading || sourceQuery.isLoading || velocityQuery.isLoading,
    error: funnelQuery.error || sourceQuery.error || velocityQuery.error,
    refetch: () => {
      funnelQuery.refetch();
      sourceQuery.refetch();
      velocityQuery.refetch();
    },
  };
}
