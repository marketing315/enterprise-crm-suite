import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";

export interface OverdueInstallment {
  payment_id: string;
  order_id: string;
  brand_id: string;
  contact_id: string | null;
  contact_name: string;
  order_number: string;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  installment_index: number;
  installment_amount: number;
  due_date: string;
  days_overdue: number;
  status: "overdue" | "upcoming" | "future";
  assigned_user_id: string | null;
}

export function useOverdueInstallments(daysAhead: number = 7) {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ["overdue-installments", currentBrand?.id, daysAhead],
    queryFn: async (): Promise<OverdueInstallment[]> => {
      if (!currentBrand?.id) return [];
      const { data, error } = await supabase.rpc("get_overdue_installments", {
        p_brand_id: currentBrand.id,
        p_days_ahead: daysAhead,
      });
      if (error) throw error;
      return (data ?? []) as OverdueInstallment[];
    },
    enabled: !!currentBrand?.id,
    staleTime: 60_000,
  });
}
