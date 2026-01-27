import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";

// =============================================================================
// Types
// =============================================================================

export interface WebhookMetrics24h {
  total_deliveries: number;
  success_count: number;
  failed_count: number;
  pending_count: number;
  sending_count: number;
  avg_attempts: number;
  avg_latency_ms: number | null;
  computed_at: string;
}

export interface TimeseriesBucket {
  bucket: string;
  success_count: number;
  failed_count: number;
  pending_count: number;
  total_count: number;
}

export interface TopError {
  error: string;
  raw_error: string;
  count: number;
  last_occurrence: string;
}

export interface TopEventType {
  event_type: string;
  total_count: number;
  success_count: number;
  failed_count: number;
  success_rate: number;
}

export interface TopWebhook {
  webhook_id: string;
  webhook_name: string;
  webhook_url: string;
  total_count: number;
  success_count: number;
  failed_count: number;
  pending_count: number;
  fail_rate: number;
  avg_attempts: number;
}

// =============================================================================
// Hooks
// =============================================================================

export function useWebhookMetrics24h() {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ["webhook-metrics-24h", currentBrand?.id],
    queryFn: async (): Promise<WebhookMetrics24h | null> => {
      if (!currentBrand?.id) return null;

      const { data, error } = await supabase.rpc("webhook_metrics_24h", {
        p_brand_id: currentBrand.id,
      });

      if (error) throw error;
      return data as unknown as WebhookMetrics24h;
    },
    enabled: !!currentBrand?.id,
    refetchInterval: 30000, // 30s auto-refresh
  });
}

export function useWebhookTimeseries24h(bucketMinutes: number = 15) {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ["webhook-timeseries-24h", currentBrand?.id, bucketMinutes],
    queryFn: async (): Promise<TimeseriesBucket[]> => {
      if (!currentBrand?.id) return [];

      const { data, error } = await supabase.rpc("webhook_timeseries_24h", {
        p_brand_id: currentBrand.id,
        p_bucket_minutes: bucketMinutes,
      });

      if (error) throw error;
      return (data as unknown as TimeseriesBucket[]) || [];
    },
    enabled: !!currentBrand?.id,
    refetchInterval: 30000,
  });
}

export function useWebhookTopErrors24h(limit: number = 10) {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ["webhook-top-errors-24h", currentBrand?.id, limit],
    queryFn: async (): Promise<TopError[]> => {
      if (!currentBrand?.id) return [];

      const { data, error } = await supabase.rpc("webhook_top_errors_24h", {
        p_brand_id: currentBrand.id,
        p_limit: limit,
      });

      if (error) throw error;
      return (data as unknown as TopError[]) || [];
    },
    enabled: !!currentBrand?.id,
    refetchInterval: 30000,
  });
}

export function useWebhookTopEventTypes24h(limit: number = 10) {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ["webhook-top-event-types-24h", currentBrand?.id, limit],
    queryFn: async (): Promise<TopEventType[]> => {
      if (!currentBrand?.id) return [];

      const { data, error } = await supabase.rpc("webhook_top_event_types_24h", {
        p_brand_id: currentBrand.id,
        p_limit: limit,
      });

      if (error) throw error;
      return (data as unknown as TopEventType[]) || [];
    },
    enabled: !!currentBrand?.id,
    refetchInterval: 30000,
  });
}

export function useWebhookTopWebhooks24h(limit: number = 10) {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ["webhook-top-webhooks-24h", currentBrand?.id, limit],
    queryFn: async (): Promise<TopWebhook[]> => {
      if (!currentBrand?.id) return [];

      const { data, error } = await supabase.rpc("webhook_top_webhooks_24h", {
        p_brand_id: currentBrand.id,
        p_limit: limit,
      });

      if (error) throw error;
      return (data as unknown as TopWebhook[]) || [];
    },
    enabled: !!currentBrand?.id,
    refetchInterval: 30000,
  });
}
