import { useQuery } from "@tanstack/react-query";
import { useBrand } from "@/contexts/BrandContext";
import { untypedClient } from "@/integrations/supabase/untypedClient";

interface ContactSalesTotals {
  contact_id: string;
  sales_count: number;
  sales_total: number;
}

export function useContactsSalesTotals() {
  const { currentBrand, isAllBrandsSelected, allBrandIds } = useBrand();

  return useQuery({
    queryKey: ["contacts-sales-totals", isAllBrandsSelected ? "all" : currentBrand?.id],
    queryFn: async (): Promise<Map<string, { count: number; total: number }>> => {
      if (!currentBrand) return new Map();

      // In global view, pass null to get all brands; otherwise pass the specific brand
      const brandId = isAllBrandsSelected ? null : currentBrand.id;

      const { data, error } = await untypedClient
        .rpc("get_contacts_with_sales_totals", { p_brand_id: brandId });

      if (error) throw error;

      const map = new Map<string, { count: number; total: number }>();
      (data as ContactSalesTotals[] || []).forEach((row) => {
        map.set(row.contact_id, {
          count: Number(row.sales_count),
          total: Number(row.sales_total),
        });
      });

      return map;
    },
    enabled: !!currentBrand,
    staleTime: 30000, // Cache for 30 seconds
  });
}
