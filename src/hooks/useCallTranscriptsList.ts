import { useQuery } from "@tanstack/react-query";
import { untypedClient } from "@/integrations/supabase/untypedClient";
import { useBrand } from "@/contexts/BrandContext";

export interface CallTranscriptRow {
  id: string;
  call_log_id: string;
  contact_id: string;
  brand_id: string;
  created_at: string;
  analyzed_at: string | null;
  summary: string | null;
  full_text: string | null;
  sentiment: string | null;
  sentiment_score: number | null;
  call_outcome: string | null;
  client_intent: string | null;
  decision_status: string | null;
  objection_type: string | null;
  clinical_interest: string | null;
  call_quality: string | null;
  notes: string | null;
  keywords: string[] | null;
  consent_status: string;
  ai_status: string;
  stt_status: string;
  channel: string | null;
  call_started_at: string | null;
  call_duration_seconds: number | null;
  call_phone_number: string | null;
  call_user_id: string | null;
  user_full_name: string | null;
  contact_first_name: string | null;
  contact_last_name: string | null;
  total_count: number;
}

export interface TranscriptFilters {
  from?: Date;
  to?: Date;
  userId?: string | null;
  sentiment?: string | null;
  outcome?: string | null;
  search?: string;
  limit?: number;
  offset?: number;
}

export function useCallTranscriptsList(filters: TranscriptFilters) {
  const { currentBrand } = useBrand();
  return useQuery({
    queryKey: ["call-transcripts-list", currentBrand?.id, filters],
    queryFn: async (): Promise<CallTranscriptRow[]> => {
      if (!currentBrand?.id) return [];
      const { data, error } = await untypedClient.rpc("list_call_transcripts", {
        p_brand_id: currentBrand.id,
        p_from: (filters.from ?? new Date(Date.now() - 30 * 86400000)).toISOString(),
        p_to: (filters.to ?? new Date()).toISOString(),
        p_user_id: filters.userId ?? null,
        p_sentiment: filters.sentiment ?? null,
        p_outcome: filters.outcome ?? null,
        p_search: filters.search ?? null,
        p_limit: filters.limit ?? 100,
        p_offset: filters.offset ?? 0,
      });
      if (error) throw error;
      return (data as CallTranscriptRow[]) ?? [];
    },
    enabled: !!currentBrand?.id,
    staleTime: 30_000,
  });
}
