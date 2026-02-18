import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { untypedClient } from "@/integrations/supabase/untypedClient";

export interface LeadDigestConfig {
  id: string;
  is_enabled: boolean;
  timezone: string;
  schedule_times: string[];
  to_recipients: string[];
  cc_recipients: string[] | null;
  include_filtered_link: boolean;
  webhook_url_override: string | null;
  updated_at: string;
}

export interface LeadDigestRun {
  id: string;
  trigger_type: "scheduled" | "manual" | "retry";
  status: "pending" | "sent" | "failed";
  window_start: string;
  window_end: string;
  lead_count_raw: number;
  lead_count_unique: number;
  dedupe_stats: Record<string, number> | null;
  to_recipients: string[];
  cc_recipients: string[] | null;
  include_filtered_link: boolean;
  filtered_link: string | null;
  response_status: number | null;
  error_message: string | null;
  attempt_no: number;
  scheduled_for_retry_at: string | null;
  sent_at: string | null;
  created_at: string;
}

const CONFIG_ID = "00000000-0000-0000-0000-000000000001";

export function useLeadDigestConfig() {
  return useQuery({
    queryKey: ["lead-digest-config"],
    queryFn: async (): Promise<LeadDigestConfig | null> => {
      const { data, error } = await untypedClient
        .from("lead_digest_config")
        .select("*")
        .eq("id", CONFIG_ID)
        .maybeSingle();

      if (error) throw error;
      return data as unknown as LeadDigestConfig | null;
    },
  });
}

export function useUpdateLeadDigestConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: Partial<LeadDigestConfig>) => {
      const { error } = await untypedClient
        .from("lead_digest_config")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", CONFIG_ID);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-digest-config"] });
    },
  });
}

export function useLeadDigestRuns(limit = 50) {
  return useQuery({
    queryKey: ["lead-digest-runs", limit],
    queryFn: async (): Promise<LeadDigestRun[]> => {
      const { data, error } = await untypedClient
        .from("lead_digest_runs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data || []) as unknown as LeadDigestRun[];
    },
    refetchInterval: 30000,
  });
}

export function useManualLeadDigestDispatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<{ success: boolean; counts: { raw: number; unique: number } }> => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/lead-digest-dispatch`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ trigger_type: "manual" }),
        }
      );

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Dispatch failed");
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-digest-runs"] });
    },
  });
}

export function useManualRetryRun() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (runId: string): Promise<void> => {
      const { error } = await untypedClient
        .from("lead_digest_runs")
        .update({ scheduled_for_retry_at: new Date().toISOString() })
        .eq("id", runId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-digest-runs"] });
    },
  });
}
