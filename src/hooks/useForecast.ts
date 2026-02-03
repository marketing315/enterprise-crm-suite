import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import type { ForecastResult, Forecast, ForecastFactor } from "@/types/predictive";

export function useRevenueForecast(period: "month" | "quarter" = "month") {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ["revenue-forecast", currentBrand?.id, period],
    queryFn: async (): Promise<ForecastResult | null> => {
      if (!currentBrand) return null;

      const { data, error } = await supabase.rpc("get_revenue_forecast", {
        p_brand_id: currentBrand.id,
        p_period: period,
      });

      if (error) throw error;
      return data as unknown as ForecastResult;
    },
    enabled: !!currentBrand,
    staleTime: 1000 * 60 * 30, // 30 minutes
  });
}

export function useForecastHistory(forecastType: "revenue" | "deals" | "margin" = "revenue") {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ["forecast-history", currentBrand?.id, forecastType],
    queryFn: async (): Promise<Forecast[]> => {
      if (!currentBrand) return [];

      const { data, error } = await supabase
        .from("forecasts")
        .select("*")
        .eq("brand_id", currentBrand.id)
        .eq("forecast_type", forecastType)
        .order("period_start", { ascending: false })
        .limit(12);

      if (error) throw error;

      return (data || []).map(f => ({
        ...f,
        forecast_type: f.forecast_type as Forecast["forecast_type"],
        factors: (f.factors as unknown as ForecastFactor[]) || [],
      }));
    },
    enabled: !!currentBrand,
  });
}

export function useRefreshForecast() {
  const { currentBrand } = useBrand();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (period: "month" | "quarter" = "month") => {
      if (!currentBrand) throw new Error("No brand selected");

      const { data, error } = await supabase.rpc("get_revenue_forecast", {
        p_brand_id: currentBrand.id,
        p_period: period,
      });

      if (error) throw error;
      return data as unknown as ForecastResult;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["revenue-forecast"] });
      queryClient.invalidateQueries({ queryKey: ["forecast-history"] });
    },
  });
}
