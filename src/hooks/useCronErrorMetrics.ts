import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CronErrorMetric {
  job_name: string;
  total: number;
  errors: number;
  successes: number;
  error_rate: number;
  last_error_at: string | null;
  last_error_status: number | null;
  last_error_message: string | null;
}

export interface CronErrorBucket {
  bucket: string;
  total: number;
  errors: number;
  successes: number;
}

export interface CronDuplicateJob {
  jobname: string;
  occurrences: number;
  jobids: number[];
  schedules: string[];
  active_count: number;
}

export function useCronErrorMetrics(from: Date, to: Date, brandId: string | null) {
  return useQuery({
    queryKey: ["admin", "cron-error-metrics", from.toISOString(), to.toISOString(), brandId],
    queryFn: async (): Promise<CronErrorMetric[]> => {
      const { data, error } = await supabase.rpc("cron_error_metrics" as never, {
        p_from: from.toISOString(),
        p_to: to.toISOString(),
        p_brand_id: brandId,
      } as never);
      if (error) throw error;
      return (data ?? []) as CronErrorMetric[];
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function useCronErrorTimeseries(
  from: Date,
  to: Date,
  brandId: string | null,
  jobName: string | null,
) {
  return useQuery({
    queryKey: [
      "admin",
      "cron-error-timeseries",
      from.toISOString(),
      to.toISOString(),
      brandId,
      jobName,
    ],
    queryFn: async (): Promise<CronErrorBucket[]> => {
      const { data, error } = await supabase.rpc("cron_error_timeseries" as never, {
        p_from: from.toISOString(),
        p_to: to.toISOString(),
        p_brand_id: brandId,
        p_job_name: jobName,
      } as never);
      if (error) throw error;
      return (data ?? []) as CronErrorBucket[];
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function useCronDuplicateJobs() {
  return useQuery({
    queryKey: ["admin", "cron-duplicate-jobs"],
    queryFn: async (): Promise<CronDuplicateJob[]> => {
      const { data, error } = await supabase.rpc("cron_duplicate_jobs" as never);
      if (error) throw error;
      return (data ?? []) as CronDuplicateJob[];
    },
    refetchInterval: 120_000,
    staleTime: 60_000,
  });
}
