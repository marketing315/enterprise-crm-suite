import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ServiceCheck {
  name: string;
  status: "healthy" | "degraded" | "down";
  latency_ms: number;
  detail?: string;
}

export interface HealthCheckResponse {
  status: "healthy" | "degraded" | "down";
  timestamp: string;
  uptime_seconds: number;
  services: ServiceCheck[];
}

export function useHealthCheck() {
  return useQuery({
    queryKey: ["health-check"],
    queryFn: async (): Promise<HealthCheckResponse> => {
      const { data, error } = await supabase.functions.invoke("health-check");
      if (error) throw error;
      return data as HealthCheckResponse;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
  });
}
