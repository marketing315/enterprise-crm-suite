import { useQuery } from "@tanstack/react-query";
import { createClient } from "@supabase/supabase-js";
import { useBrand } from "@/contexts/BrandContext";

// Untyped client for new tables not in generated types
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const untypedClient = createClient(supabaseUrl, supabaseKey);

// System brand ID for global view
const SYSTEM_BRAND_ID = "00000000-0000-0000-0000-000000000000";

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
