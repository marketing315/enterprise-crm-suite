import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";

export interface BrandSettings {
  auto_assign_enabled: boolean;
}

export function useBrandSettings() {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ["brand-settings", currentBrand?.id],
    queryFn: async (): Promise<BrandSettings | null> => {
      if (!currentBrand?.id) return null;

      // Using raw query since types may not be updated yet
      const { data, error } = await supabase
        .from("brands")
        .select("*")
        .eq("id", currentBrand.id)
        .single();

      if (error) throw error;
      
      // Extract auto_assign_enabled from the response
      const brandData = data as Record<string, unknown>;
      return {
        auto_assign_enabled: brandData.auto_assign_enabled as boolean ?? true,
      };
    },
    enabled: !!currentBrand?.id,
  });
}

export function useUpdateBrandSettings() {
  const queryClient = useQueryClient();
  const { currentBrand } = useBrand();

  return useMutation({
    mutationFn: async (settings: Partial<BrandSettings>) => {
      if (!currentBrand?.id) throw new Error("No brand selected");

      // Using raw update since types may not be updated yet
      const { error } = await supabase
        .from("brands")
        .update(settings as Record<string, unknown>)
        .eq("id", currentBrand.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brand-settings", currentBrand?.id] });
    },
  });
}
