import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";

export interface CallcenterKpisOverview {
  tickets_created: number;
  tickets_assigned: number;
  tickets_resolved: number;
  tickets_closed: number;
  avg_time_to_assign_minutes: number;
  avg_time_to_resolve_minutes: number;
  backlog_total: number;
  unassigned_now: number;
  priority_distribution: Array<{ priority: number; count: number }>;
  status_distribution: Array<{ status: string; count: number }>;
  daily_trend: Array<{ date: string; created: number; resolved: number }>;
}

export interface OperatorKpis {
  user_id: string;
  full_name: string | null;
  email: string;
  role: string;
  tickets_assigned: number;
  tickets_resolved: number;
  tickets_closed: number;
  avg_time_to_assign_minutes: number;
  avg_time_to_resolve_minutes: number;
  backlog_current: number;
}

export function useCallcenterKpisOverview(from: Date, to: Date) {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ["callcenter-kpis-overview", currentBrand?.id, from.toISOString(), to.toISOString()],
    queryFn: async () => {
      if (!currentBrand?.id) return null;

      const { data, error } = await supabase.rpc("get_callcenter_kpis_overview", {
        p_brand_id: currentBrand.id,
        p_from: from.toISOString(),
        p_to: to.toISOString(),
      });

      if (error) throw error;
      if (!data) return null;
      return data as unknown as CallcenterKpisOverview;
    },
    enabled: !!currentBrand?.id,
  });
}

export function useCallcenterKpisByOperator(from: Date, to: Date) {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ["callcenter-kpis-by-operator", currentBrand?.id, from.toISOString(), to.toISOString()],
    queryFn: async () => {
      if (!currentBrand?.id) return [];

      const { data, error } = await supabase.rpc("get_callcenter_kpis_by_operator", {
        p_brand_id: currentBrand.id,
        p_from: from.toISOString(),
        p_to: to.toISOString(),
      });

      if (error) throw error;
      if (!data) return [];
      return data as unknown as OperatorKpis[];
    },
    enabled: !!currentBrand?.id,
  });
}
