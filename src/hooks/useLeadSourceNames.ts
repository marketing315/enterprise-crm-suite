import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";

/**
 * Fetches distinct lead event source_names for the current brand(s).
 * Used for filtering contacts by lead source.
 */
export function useLeadSourceNames() {
  const { currentBrand, isAllBrandsSelected, allBrandIds } = useBrand();

  return useQuery({
    queryKey: ["lead-source-names", isAllBrandsSelected ? "all" : currentBrand?.id],
    queryFn: async (): Promise<string[]> => {
      let query = supabase
        .from("lead_events")
        .select("source_name, contact_id")
        .not("source_name", "is", null)
        .not("contact_id", "is", null);

      if (isAllBrandsSelected) {
        query = query.in("brand_id", allBrandIds);
      } else if (currentBrand) {
        query = query.eq("brand_id", currentBrand.id);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Deduplicate client-side (no .distinct() in supabase-js)
      const unique = [...new Set((data || []).map((d) => d.source_name as string))];
      return unique.filter(Boolean).sort((a, b) => a.localeCompare(b));
    },
    enabled: isAllBrandsSelected ? allBrandIds.length > 0 : !!currentBrand?.id,
    staleTime: 1000 * 60 * 5,
  });
}
