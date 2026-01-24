import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";

export interface AIMetricsOverview {
  job_counts: {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    total: number;
  };
  latency: {
    avg_ms: number;
    p95_ms: number;
    avg_attempts: number;
  };
  fallback_count: number;
  lead_type_distribution: Array<{ type: string; count: number }>;
  priority_distribution: Array<{ priority: number; count: number }>;
  ticket_stats: {
    support_count: number;
    tickets_created: number;
  };
  daily_trend: Array<{ date: string; completed: number; failed: number }>;
}

export interface AIMetricsError {
  error: string;
  count: number;
  last_occurrence: string;
}

export type MetricsPeriod = "today" | "7d" | "30d";

function getPeriodDates(period: MetricsPeriod): { from: Date; to: Date } {
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  
  switch (period) {
    case "today":
      break;
    case "7d":
      from.setDate(from.getDate() - 7);
      break;
    case "30d":
      from.setDate(from.getDate() - 30);
      break;
  }
  
  return { from, to };
}

export function useAIMetricsOverview(period: MetricsPeriod = "7d") {
  const { currentBrand } = useBrand();
  const { from, to } = getPeriodDates(period);

  return useQuery({
    queryKey: ["ai-metrics-overview", currentBrand?.id, period],
    queryFn: async () => {
      if (!currentBrand?.id) return null;

      const { data, error } = await supabase.rpc("get_ai_metrics_overview", {
        p_brand_id: currentBrand.id,
        p_from: from.toISOString(),
        p_to: to.toISOString(),
      });

      if (error) throw error;
      return data as unknown as AIMetricsOverview;
    },
    enabled: !!currentBrand?.id,
  });
}

export function useAIMetricsErrors(period: MetricsPeriod = "7d") {
  const { currentBrand } = useBrand();
  const { from, to } = getPeriodDates(period);

  return useQuery({
    queryKey: ["ai-metrics-errors", currentBrand?.id, period],
    queryFn: async () => {
      if (!currentBrand?.id) return [];

      const { data, error } = await supabase.rpc("get_ai_metrics_errors", {
        p_brand_id: currentBrand.id,
        p_from: from.toISOString(),
        p_to: to.toISOString(),
      });

      if (error) throw error;
      return (data as unknown as AIMetricsError[]) || [];
    },
    enabled: !!currentBrand?.id,
  });
}
