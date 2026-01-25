import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";

export interface DailyTrend {
  date: string;
  created: number;
  resolved: number;
  closed: number;
}

export interface BacklogTrend {
  date: string;
  backlog: number;
}

export interface TopCategory {
  tag_id: string | null;
  tag_name: string;
  tag_color: string;
  count: number;
}

export interface AgingBuckets {
  bucket_0_1h: number;
  bucket_1_4h: number;
  bucket_4_24h: number;
  bucket_over_24h: number;
}

export interface OperatorBreakdown {
  user_id: string;
  full_name: string | null;
  email: string;
  assigned_count: number;
  resolved_count: number;
  avg_resolution_minutes: number;
  current_backlog: number;
}

export interface TrendSummary {
  total_created: number;
  total_resolved: number;
  total_closed: number;
  current_backlog: number;
  current_unassigned: number;
}

export interface TicketTrendDashboard {
  daily_trend: DailyTrend[];
  backlog_trend: BacklogTrend[];
  top_categories: TopCategory[];
  aging_buckets: AgingBuckets;
  operator_breakdown: OperatorBreakdown[];
  summary: TrendSummary;
}

export function useTicketTrendDashboard(from: Date, to: Date) {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ["ticket-trend-dashboard", currentBrand?.id, from.toISOString(), to.toISOString()],
    queryFn: async () => {
      if (!currentBrand?.id) return null;

      const { data, error } = await supabase.rpc("get_ticket_trend_dashboard", {
        p_brand_id: currentBrand.id,
        p_from: from.toISOString(),
        p_to: to.toISOString(),
      });

      if (error) throw error;
      if (!data) return null;
      return data as unknown as TicketTrendDashboard;
    },
    enabled: !!currentBrand?.id,
  });
}
