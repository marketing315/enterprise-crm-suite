import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AppointmentsOpsKpi {
  total: number;
  status_breakdown: Record<string, number>;
  outcome_breakdown: Record<string, number>;
  executed_count: number;
  no_show_count: number;
  execution_rate: number;
  no_show_rate: number;
  at_risk_next_48h: number;
  pending_follow_up: number;
  avg_risk_score: number;
}

interface Params {
  brandId?: string | null;
  dateFrom: string;
  dateTo: string;
}

export function useAppointmentsOpsKpi({ brandId, dateFrom, dateTo }: Params) {
  return useQuery({
    queryKey: ["appointments-ops-kpi", brandId, dateFrom, dateTo],
    queryFn: async (): Promise<AppointmentsOpsKpi> => {
      const { data, error } = await supabase.rpc("get_appointments_ops_kpi", {
        p_brand_id: brandId!,
        p_date_from: dateFrom,
        p_date_to: dateTo,
      });
      if (error) throw error;
      return data as unknown as AppointmentsOpsKpi;
    },
    enabled: !!brandId,
    staleTime: 60_000,
  });
}
