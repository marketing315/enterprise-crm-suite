/**
 * F5: funnel singolo venditore + trend mensile 12 mesi.
 */
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

export type FunnelData = {
  assegnati: number;
  visitati: number;
  ordini: number;
  consegnati: number;
  lordo: number;
  perc_visita: number;
  perc_vendita: number;
  perc_consegna: number;
};

export type TrendPoint = {
  mese: string;
  assegnati: number;
  visitati: number;
  ordini: number;
  consegnati: number;
  lordo: number;
};

export type SalespersonFunnelResult = {
  funnel: FunnelData;
  trend: TrendPoint[];
  period: { from: string; to: string };
};

export function useSalespersonFunnel(
  brandId: string | null,
  userId: string | null,
  from: Date,
  to: Date,
) {
  return useQuery({
    queryKey: ["salesperson-funnel", brandId, userId, format(from, "yyyy-MM-dd"), format(to, "yyyy-MM-dd")],
    enabled: !!brandId && !!userId,
    queryFn: async (): Promise<SalespersonFunnelResult> => {
      const { data, error } = await supabase.rpc("get_salesperson_funnel", {
        p_brand_id: brandId!,
        p_user_id: userId!,
        p_from: format(from, "yyyy-MM-dd"),
        p_to: format(to, "yyyy-MM-dd"),
      });
      if (error) throw error;
      return data as unknown as SalespersonFunnelResult;
    },
    staleTime: 60_000,
  });
}
