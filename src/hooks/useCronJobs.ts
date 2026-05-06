import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CronJobRow {
  jobid: number;
  jobname: string;
  schedule: string;
  active: boolean;
  command_redacted: string;
  registered: boolean;
  tenant_scope: string | null;
  brand_id: string | null;
  owner_role: string | null;
  is_critical: boolean;
}

export interface UnregisteredJob {
  jobname: string;
  jobid: number;
  schedule: string;
}

export interface CronRunLogRow {
  id: number;
  job_name: string;
  brand_id: string | null;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  status: "running" | "success" | "error" | "skipped";
  error_summary: string | null;
}

export function useCronJobs() {
  return useQuery({
    queryKey: ["admin", "cron-jobs"],
    queryFn: async (): Promise<CronJobRow[]> => {
      const { data, error } = await supabase.rpc("list_cron_jobs" as never);
      if (error) throw error;
      return (data ?? []) as CronJobRow[];
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function useUnregisteredCronJobs() {
  return useQuery({
    queryKey: ["admin", "cron-jobs", "unregistered"],
    queryFn: async (): Promise<UnregisteredJob[]> => {
      const { data, error } = await supabase.rpc("detect_unregistered_cron_jobs" as never);
      if (error) throw error;
      return (data ?? []) as UnregisteredJob[];
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function useCronRunLog(limit = 100) {
  return useQuery({
    queryKey: ["admin", "cron-run-log", limit],
    queryFn: async (): Promise<CronRunLogRow[]> => {
      const { data, error } = await supabase
        .from("cron_run_log" as never)
        .select("id, job_name, brand_id, started_at, finished_at, duration_ms, status, error_summary")
        .order("started_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as CronRunLogRow[];
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}
