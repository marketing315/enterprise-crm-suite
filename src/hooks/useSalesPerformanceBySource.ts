/**
 * F5: breakdown vendite per fonte (categoria/canale) con prezzo medio.
 */
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

export type SalesBySourceRow = {
  source_category: string;
  channel_id: string | null;
  channel_name: string | null;
  leads_count: number;
  appts_eseguiti: number;
  ordini_venduti: number;
  lordo: number;
  perc_vendita: number;
  prezzo_medio: number;
  consegnati: number;
  perc_consegne: number;
};

export function useSalesPerformanceBySource(
  brandId: string | null,
  from: Date,
  to: Date,
) {
  return useQuery({
    queryKey: ["sales-perf-by-source", brandId, format(from, "yyyy-MM-dd"), format(to, "yyyy-MM-dd")],
    enabled: !!brandId,
    queryFn: async (): Promise<SalesBySourceRow[]> => {
      const { data, error } = await supabase.rpc("get_sales_performance_by_source", {
        p_brand_id: brandId!,
        p_from: format(from, "yyyy-MM-dd"),
        p_to: format(to, "yyyy-MM-dd"),
      });
      if (error) throw error;
      return (data ?? []) as SalesBySourceRow[];
    },
    staleTime: 60_000,
  });
}
