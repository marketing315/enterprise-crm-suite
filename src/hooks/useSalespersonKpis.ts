import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";

export interface SalespersonKpi {
  user_id: string;
  full_name: string | null;
  email: string;
  role: string;
  deals_open: number;
  deals_won: number;
  deals_lost: number;
  deals_closed: number;
  total_value_won: number;
  win_rate: number;
  avg_days_to_close: number;
  last_activity_at: string | null;
}

interface UseSalespersonKpisOptions {
  from?: Date;
  to?: Date;
}

export function useSalespersonKpis(options: UseSalespersonKpisOptions = {}) {
  const { currentBrand, isAllBrandsSelected } = useBrand();

  return useQuery({
    queryKey: ["salesperson-kpis", isAllBrandsSelected ? "all" : currentBrand?.id, options.from?.toISOString(), options.to?.toISOString()],
    queryFn: async (): Promise<SalespersonKpi[]> => {
      if (!currentBrand) return [];

      const { data, error } = await supabase.rpc("get_salesperson_kpis", {
        p_brand_id: currentBrand.id,
        p_from: options.from?.toISOString() || null,
        p_to: options.to?.toISOString() || null,
      });

      if (error) throw error;
      return (data as unknown as SalespersonKpi[]) || [];
    },
    enabled: !!currentBrand,
  });
}

// Hook per ottenere i venditori assegnabili (per il dropdown assegnazione)
export function useAssignableSalespersons() {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ["assignable-salespersons", currentBrand?.id],
    queryFn: async () => {
      if (!currentBrand) return [];

      const { data, error } = await supabase
        .from("user_roles")
        .select(`
          user_id,
          role,
          users:user_id(id, full_name, email)
        `)
        .eq("brand_id", currentBrand.id)
        .eq("role", "venditore")
        .eq("is_active", true);

      if (error) throw error;
      
      return (data || []).map((item) => {
        const user = item.users as unknown as { id: string; full_name: string | null; email: string } | null;
        return {
          id: user?.id,
          full_name: user?.full_name,
          email: user?.email,
          role: item.role,
        };
      });
    },
    enabled: !!currentBrand,
  });
}
