import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";

// Default SLA thresholds in minutes
export const DEFAULT_SLA_THRESHOLDS: SlaThresholds = {
  "1": 60,    // P1: 1 hour
  "2": 120,   // P2: 2 hours
  "3": 240,   // P3: 4 hours
  "4": 480,   // P4: 8 hours
  "5": 1440,  // P5: 24 hours
};

export type SlaThresholds = {
  "1": number;
  "2": number;
  "3": number;
  "4": number;
  "5": number;
};

export interface BrandSettings {
  auto_assign_enabled: boolean;
  sla_thresholds_minutes: SlaThresholds;
}

export function useBrandSettings() {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ["brand-settings", currentBrand?.id],
    queryFn: async (): Promise<BrandSettings | null> => {
      if (!currentBrand?.id) return null;

      const { data, error } = await supabase
        .from("brands")
        .select("*")
        .eq("id", currentBrand.id)
        .single();

      if (error) throw error;
      
      const brandData = data as Record<string, unknown>;
      
      // Parse SLA thresholds with fallback to defaults
      let slaThresholds = DEFAULT_SLA_THRESHOLDS;
      if (brandData.sla_thresholds_minutes) {
        try {
          const parsed = typeof brandData.sla_thresholds_minutes === 'string' 
            ? JSON.parse(brandData.sla_thresholds_minutes)
            : brandData.sla_thresholds_minutes;
          slaThresholds = {
            "1": parsed["1"] ?? DEFAULT_SLA_THRESHOLDS["1"],
            "2": parsed["2"] ?? DEFAULT_SLA_THRESHOLDS["2"],
            "3": parsed["3"] ?? DEFAULT_SLA_THRESHOLDS["3"],
            "4": parsed["4"] ?? DEFAULT_SLA_THRESHOLDS["4"],
            "5": parsed["5"] ?? DEFAULT_SLA_THRESHOLDS["5"],
          };
        } catch {
          // Use defaults if parsing fails
        }
      }

      return {
        auto_assign_enabled: brandData.auto_assign_enabled as boolean ?? true,
        sla_thresholds_minutes: slaThresholds,
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

      const { error } = await supabase
        .from("brands")
        .update(settings as Record<string, unknown>)
        .eq("id", currentBrand.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brand-settings", currentBrand?.id] });
      // Also invalidate ticket queries to refresh SLA status
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
  });
}
