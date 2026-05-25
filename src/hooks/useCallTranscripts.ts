import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { untypedClient } from "@/integrations/supabase/untypedClient";
import { useBrandFilter } from "@/hooks/useBrandFilter";

export interface CallTranscript {
  id: string;
  call_log_id: string;
  brand_id: string;
  contact_id: string;
  full_text: string | null;
  summary: string | null;
  ai_model: string | null;
  ai_status: "pending" | "processing" | "completed" | "failed";
  ai_error: string | null;
  tokens_used: number | null;
  latency_ms: number | null;
  created_at: string;
  updated_at: string;
  // F3 extensions
  sentiment?: string | null;
  sentiment_score?: number | null;
  // F3-bis: diarization & per-speaker sentiment
  sentiment_customer?: string | null;
  sentiment_customer_score?: number | null;
  sentiment_operator?: string | null;
  sentiment_operator_score?: number | null;
  speaker_turns?: Array<{ speaker: "customer" | "operator"; text: string; sentiment?: string }> | null;
  diarization_status?: string | null;
  call_outcome?: string | null;
  notes?: string | null;
  keywords?: string[] | null;
  consent_status?: string;
  stt_status?: string;
}

export interface TelephonyKpis {
  total_calls: number;
  answered_calls: number;
  missed_calls: number;
  failed_calls: number;
  busy_calls: number;
  answered_rate: number;
  avg_duration_seconds: number | null;
  p90_duration_seconds: number | null;
  avg_response_time_seconds: number | null;
  p90_response_time_seconds: number | null;
  by_operator: Array<{
    user_id: string;
    full_name: string | null;
    total: number;
    answered: number;
    avg_duration: number | null;
    avg_response_time: number | null;
  }>;
  daily_trend: Array<{
    call_date: string;
    total: number;
    answered: number;
    missed: number;
  }>;
}

export function useContactCallTranscripts(contactId: string | null) {
  return useQuery({
    queryKey: ["call-transcripts", "contact", contactId],
    queryFn: async (): Promise<(CallTranscript & { call_log?: any })[]> => {
      if (!contactId) return [];

      const { data, error } = await untypedClient
        .from("call_transcripts")
        .select(`
          *,
          call_log:call_logs!call_transcripts_call_log_id_fkey(
            id, phone_number, call_type, status, duration_seconds,
            response_time_seconds, started_at, ended_at, outcome,
            user:users!call_logs_user_id_fkey(id, full_name)
          )
        `)
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!contactId,
  });
}

export function useTelephonyKpis(from: Date, to: Date) {
  const { getBrandIds, getQueryKeyBrand, isQueryEnabled } = useBrandFilter();

  return useQuery({
    queryKey: ["telephony-kpis", getQueryKeyBrand(), from.toISOString(), to.toISOString()],
    queryFn: async (): Promise<TelephonyKpis | null> => {
      const brandIds = getBrandIds();
      if (brandIds.length === 0) return null;

      const { data, error } = await untypedClient.rpc("get_call_center_telephony_kpis", {
        p_brand_id: brandIds[0],
        p_from: from.toISOString(),
        p_to: to.toISOString(),
      });

      if (error) throw error;
      return data as unknown as TelephonyKpis;
    },
    enabled: isQueryEnabled(),
  });
}
