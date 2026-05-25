/**
 * F5.7 — DPIA / Data Retention hooks
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type BrandRetentionConfig = {
  brand_id: string;
  call_audio_retention_days: number | null;
  call_transcript_retention_days: number | null;
  alert_events_retention_days: number | null;
  sheets_export_logs_retention_days: number | null;
  dpia_acknowledged_at: string | null;
  dpia_acknowledged_by: string | null;
  dpia_version: string | null;
  notes: string | null;
  updated_at: string;
};

export type RetentionRun = {
  id: number;
  brand_id: string | null;
  dry_run: boolean;
  triggered_via: string;
  triggered_by: string | null;
  results: Array<{
    brand_id: string;
    audio_anonymized: number;
    transcripts_deleted: number;
    alert_events_deleted: number;
    sheets_logs_deleted: number;
  }>;
  total_affected: number;
  error: string | null;
  created_at: string;
};

export function useBrandsForRetention() {
  return useQuery({
    queryKey: ["retention", "brands"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brands")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useRetentionConfigs() {
  return useQuery({
    queryKey: ["retention", "configs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brand_data_retention_config")
        .select("*");
      if (error) throw error;
      return (data ?? []) as BrandRetentionConfig[];
    },
  });
}

export function useUpsertRetentionConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      brand_id: string;
      call_audio_retention_days: number | null;
      call_transcript_retention_days: number | null;
      alert_events_retention_days: number | null;
      sheets_export_logs_retention_days: number | null;
      dpia_acknowledge?: boolean;
      dpia_version?: string | null;
      notes?: string | null;
    }) => {
      const { data, error } = await supabase.rpc("upsert_brand_retention_config", {
        p_brand_id: input.brand_id,
        p_call_audio_retention_days: input.call_audio_retention_days,
        p_call_transcript_retention_days: input.call_transcript_retention_days,
        p_alert_events_retention_days: input.alert_events_retention_days,
        p_sheets_export_logs_retention_days: input.sheets_export_logs_retention_days,
        p_dpia_acknowledge: input.dpia_acknowledge ?? false,
        p_dpia_version: input.dpia_version ?? null,
        p_notes: input.notes ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["retention"] }),
  });
}

export function useRetentionRuns() {
  return useQuery({
    queryKey: ["retention", "runs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("data_retention_runs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as RetentionRun[];
    },
  });
}

export function useRunRetentionCleanup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { brand_id?: string | null; dry_run: boolean }) => {
      const { data, error } = await supabase.rpc("run_data_retention_cleanup", {
        p_brand_id: input.brand_id ?? null,
        p_dry_run: input.dry_run,
        p_triggered_via: "manual",
      });
      if (error) throw error;
      return data as {
        dry_run: boolean;
        total_affected: number;
        results: Array<Record<string, unknown>>;
      };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["retention", "runs"] }),
  });
}
