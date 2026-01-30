import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import type { Json } from "@/integrations/supabase/types";

// ========================================
// Types
// ========================================

export type IngestDlqReason =
  | "invalid_json"
  | "mapping_error"
  | "missing_required"
  | "signature_failed"
  | "rate_limited"
  | "ai_extraction_failed"
  | "contact_creation_failed"
  | "unknown_error";

export interface IngestDlqEntry {
  id: string;
  source_id: string | null;
  brand_id: string | null;
  raw_body: Json | null;
  raw_body_text: string | null;
  headers: Json | null;
  ip_address: string | null;
  user_agent: string | null;
  status: string | null;
  processed: boolean;
  error_message: string | null;
  dlq_reason: IngestDlqReason | null;
  lead_event_id: string | null;
  created_at: string;
  // Joined
  webhook_sources?: { name: string } | null;
}

export interface OutboundDlqEntry {
  id: string;
  webhook_id: string;
  brand_id: string;
  event_type: string;
  event_id: string;
  payload: Json;
  status: string;
  attempt_count: number;
  max_attempts: number;
  response_status: number | null;
  response_body: string | null;
  last_error: string | null;
  dead_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  outbound_webhooks_safe?: { name: string; url: string } | null;
}

// ========================================
// Ingest DLQ Hook
// ========================================

export function useIngestDlq(limit = 50) {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ["ingest-dlq", currentBrand?.id, limit],
    queryFn: async (): Promise<IngestDlqEntry[]> => {
      if (!currentBrand) return [];

      const { data, error } = await supabase
        .from("incoming_requests")
        .select(`
          id, source_id, brand_id, raw_body, raw_body_text, headers, ip_address, user_agent,
          status, processed, error_message, dlq_reason, lead_event_id, created_at,
          webhook_sources(name)
        `)
        .eq("brand_id", currentBrand.id)
        .or("status.eq.failed,dlq_reason.not.is.null")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data || []) as unknown as IngestDlqEntry[];
    },
    enabled: !!currentBrand,
  });
}

export function useReplayIngestDlq() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (requestId: string) => {
      const { data, error } = await supabase.rpc("replay_ingest_dlq", {
        p_request_id: requestId,
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string };
      if (!result.success) {
        throw new Error(result.error || "Replay failed");
      }

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ingest-dlq"] });
    },
  });
}

// ========================================
// Outbound DLQ Hook
// ========================================

export function useOutboundDlq(limit = 50) {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ["outbound-dlq", currentBrand?.id, limit],
    queryFn: async (): Promise<OutboundDlqEntry[]> => {
      if (!currentBrand) return [];

      const { data, error } = await supabase
        .from("outbound_webhook_deliveries")
        .select(`
          id, webhook_id, brand_id, event_type, event_id, payload, status,
          attempt_count, max_attempts, response_status, response_body, last_error,
          dead_at, created_at, updated_at,
          outbound_webhooks_safe(name, url)
        `)
        .eq("brand_id", currentBrand.id)
        .eq("status", "dead")
        .order("dead_at", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data || []) as unknown as OutboundDlqEntry[];
    },
    enabled: !!currentBrand,
  });
}

export function useReplayOutboundDlq() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ deliveryId, overrideUrl }: { deliveryId: string; overrideUrl?: string }) => {
      const { data, error } = await supabase.rpc("replay_outbound_dlq", {
        p_delivery_id: deliveryId,
        p_override_url: overrideUrl || null,
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string };
      if (!result.success) {
        throw new Error(result.error || "Replay failed");
      }

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outbound-dlq"] });
      queryClient.invalidateQueries({ queryKey: ["webhook-deliveries"] });
    },
  });
}

// ========================================
// DLQ Stats
// ========================================

export function useDlqStats() {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ["dlq-stats", currentBrand?.id],
    queryFn: async () => {
      if (!currentBrand) return { ingest: 0, outbound: 0 };

      const [ingestRes, outboundRes] = await Promise.all([
        supabase
          .from("incoming_requests")
          .select("id", { count: "exact", head: true })
          .eq("brand_id", currentBrand.id)
          .or("status.eq.failed,dlq_reason.not.is.null"),
        supabase
          .from("outbound_webhook_deliveries")
          .select("id", { count: "exact", head: true })
          .eq("brand_id", currentBrand.id)
          .eq("status", "dead"),
      ]);

      return {
        ingest: ingestRes.count || 0,
        outbound: outboundRes.count || 0,
      };
    },
    enabled: !!currentBrand,
    refetchInterval: 60000, // Refresh every minute
  });
}
