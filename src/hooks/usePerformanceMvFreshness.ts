/**
 * F5: legge l'ultimo refresh delle MV performance (per banner UI).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type MvFreshnessRow = {
  mv_name: string;
  last_refreshed_at: string;
  last_duration_ms: number | null;
  last_rows: number | null;
  last_error: string | null;
  age_seconds: number;
};

export function usePerformanceMvFreshness() {
  return useQuery({
    queryKey: ["performance-mv-freshness"],
    queryFn: async (): Promise<MvFreshnessRow[]> => {
      const { data, error } = await supabase.rpc("get_performance_mv_freshness");
      if (error) throw error;
      return (data ?? []) as MvFreshnessRow[];
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}
