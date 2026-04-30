import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type BackupSchedule = {
  id: string;
  brand_id: string;
  brand_name: string | null;
  scope: "minimal" | "standard" | "full";
  frequency: "daily" | "weekly";
  hour_utc: number;
  day_of_week: number | null;
  retention_days: number;
  enabled: boolean;
  last_run_at: string | null;
  last_run_status: string | null;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
};

export type BackupArchive = {
  run_id: string;
  brand_id: string;
  scope: string;
  storage_path: string;
  storage_uploaded_at: string;
  size_bytes: number;
  total_rows: number;
  status: string;
  expires_at: string | null;
  scheduled: boolean;
  created_at: string;
};

export function useBackupSchedules() {
  return useQuery({
    queryKey: ["backup-schedules"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_backup_schedules" as any);
      if (error) throw error;
      return (data ?? []) as BackupSchedule[];
    },
    staleTime: 60_000,
  });
}

export function useUpsertBackupSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      brand_id: string;
      scope: "minimal" | "standard" | "full";
      frequency: "daily" | "weekly";
      hour_utc: number;
      day_of_week: number | null;
      retention_days: number;
      enabled: boolean;
    }) => {
      const { data, error } = await supabase.rpc("upsert_backup_schedule" as any, {
        p_brand_id: input.brand_id,
        p_scope: input.scope,
        p_frequency: input.frequency,
        p_hour_utc: input.hour_utc,
        p_day_of_week: input.day_of_week,
        p_retention_days: input.retention_days,
        p_enabled: input.enabled,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      toast.success("Pianificazione salvata");
      qc.invalidateQueries({ queryKey: ["backup-schedules"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Errore salvataggio pianificazione"),
  });
}

export function useBackupArchives(brandId?: string) {
  return useQuery({
    queryKey: ["backup-archives", brandId],
    queryFn: async () => {
      if (!brandId) return [] as BackupArchive[];
      const { data, error } = await supabase.rpc("list_backup_archives" as any, {
        p_brand_id: brandId,
        p_limit: 100,
      });
      if (error) throw error;
      return (data ?? []) as BackupArchive[];
    },
    enabled: !!brandId,
    staleTime: 30_000,
  });
}

export function useDownloadBackupArchive() {
  return useMutation({
    mutationFn: async (runId: string) => {
      const { data, error } = await supabase.functions.invoke("backup-archive-signed-url", {
        body: { run_id: runId },
      });
      if (error) throw error;
      const url = (data as any)?.signed_url;
      if (!url) throw new Error("URL firmato non ricevuto");
      window.open(url, "_blank");
      return url as string;
    },
    onError: (e: any) => toast.error(e?.message ?? "Errore download archivio"),
  });
}
