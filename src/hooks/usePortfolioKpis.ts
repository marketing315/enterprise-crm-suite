import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand, SYSTEM_BRAND_ID } from "@/contexts/BrandContext";

export interface PortfolioBrandKpi {
  brand_id: string;
  brand_name: string;
  spend: number;
  leads: number;
  deals_won: number;
  revenue: number;
  roas: number | null;
  cpl: number | null;
}

/**
 * Cross-brand portfolio metrics.
 * Pass `enabled` to opt-in (typically only when system brand is active).
 */
export function usePortfolioKpis(fromDate: string, toDate: string, enabled = true) {
  const { currentBrand } = useBrand();
  const isSystem = currentBrand?.id === SYSTEM_BRAND_ID;

  return useQuery({
    queryKey: ["portfolio-kpis", fromDate, toDate],
    queryFn: async (): Promise<PortfolioBrandKpi[]> => {
      const { data, error } = await supabase.rpc("get_portfolio_kpis" as never, {
        p_brand_ids: [SYSTEM_BRAND_ID],
        p_from: fromDate,
        p_to: toDate,
      } as never);
      if (error) throw error;
      return ((data as unknown) as PortfolioBrandKpi[]) ?? [];
    },
    enabled: enabled && isSystem && !!fromDate && !!toDate,
    staleTime: 120_000,
  });
}
