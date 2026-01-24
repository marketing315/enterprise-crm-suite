import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";

export interface BrandOperator {
  user_id: string;
  supabase_auth_id: string;
  full_name: string | null;
  email: string;
  role: string;
}

export function useBrandOperators() {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ["brand-operators", currentBrand?.id],
    queryFn: async () => {
      if (!currentBrand?.id) return [];

      const { data, error } = await supabase.rpc("get_brand_operators", {
        p_brand_id: currentBrand.id,
      });

      if (error) throw error;
      return (data as BrandOperator[]) || [];
    },
    enabled: !!currentBrand?.id,
  });
}
