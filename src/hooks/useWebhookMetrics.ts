import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrandFilter } from "@/hooks/useBrandFilter";

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
  p50_latency_ms: number | null;
  p95_latency_ms: number | null;
  p99_latency_ms: number | null;
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
  const { getBrandIds, getQueryKeyBrand, isQueryEnabled } = useBrandFilter();

  return useQuery({
    queryKey: ["webhook-metrics-24h", getQueryKeyBrand()],
    queryFn: async (): Promise<WebhookMetrics24h | null> => {
      const brandIds = getBrandIds();
      if (brandIds.length === 0) return null;

      const { data, error } = await supabase.rpc("webhook_metrics_24h", {
        p_brand_id: brandIds[0],
      });

      if (error) throw error;
      return data as unknown as WebhookMetrics24h;
    },
    enabled: isQueryEnabled(),
    refetchInterval: 30000,
  });
}

export function useWebhookTimeseries24h(bucketMinutes: number = 15) {
  const { getBrandIds, getQueryKeyBrand, isQueryEnabled } = useBrandFilter();

  return useQuery({
    queryKey: ["webhook-timeseries-24h", getQueryKeyBrand(), bucketMinutes],
    queryFn: async (): Promise<TimeseriesBucket[]> => {
      const brandIds = getBrandIds();
      if (brandIds.length === 0) return [];

      const { data, error } = await supabase.rpc("webhook_timeseries_24h", {
        p_brand_id: brandIds[0],
        p_bucket_minutes: bucketMinutes,
      });

      if (error) throw error;
      return (data as unknown as TimeseriesBucket[]) || [];
    },
    enabled: isQueryEnabled(),
    refetchInterval: 30000,
  });
}

export function useWebhookTopErrors24h(limit: number = 10) {
  const { getBrandIds, getQueryKeyBrand, isQueryEnabled } = useBrandFilter();

  return useQuery({
    queryKey: ["webhook-top-errors-24h", getQueryKeyBrand(), limit],
    queryFn: async (): Promise<TopError[]> => {
      const brandIds = getBrandIds();
      if (brandIds.length === 0) return [];

      const { data, error } = await supabase.rpc("webhook_top_errors_24h", {
        p_brand_id: brandIds[0],
        p_limit: limit,
      });

      if (error) throw error;
      return (data as unknown as TopError[]) || [];
    },
    enabled: isQueryEnabled(),
    refetchInterval: 30000,
  });
}

export function useWebhookTopEventTypes24h(limit: number = 10) {
  const { getBrandIds, getQueryKeyBrand, isQueryEnabled } = useBrandFilter();

  return useQuery({
    queryKey: ["webhook-top-event-types-24h", getQueryKeyBrand(), limit],
    queryFn: async (): Promise<TopEventType[]> => {
      const brandIds = getBrandIds();
      if (brandIds.length === 0) return [];

      const { data, error } = await supabase.rpc("webhook_top_event_types_24h", {
        p_brand_id: brandIds[0],
        p_limit: limit,
      });

      if (error) throw error;
      return (data as unknown as TopEventType[]) || [];
    },
    enabled: isQueryEnabled(),
    refetchInterval: 30000,
  });
}

export function useWebhookTopWebhooks24h(limit: number = 10) {
  const { getBrandIds, getQueryKeyBrand, isQueryEnabled } = useBrandFilter();

  return useQuery({
    queryKey: ["webhook-top-webhooks-24h", getQueryKeyBrand(), limit],
    queryFn: async (): Promise<TopWebhook[]> => {
      const brandIds = getBrandIds();
      if (brandIds.length === 0) return [];

      const { data, error } = await supabase.rpc("webhook_top_webhooks_24h", {
        p_brand_id: brandIds[0],
        p_limit: limit,
      });

      if (error) throw error;
      return (data as unknown as TopWebhook[]) || [];
    },
    enabled: isQueryEnabled(),
    refetchInterval: 30000,
  });
}
