import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrandFilter } from "./useBrandFilter";
import { toast } from "sonner";

export interface AutomationJob {
  id: string;
  brand_id: string;
  source_event_id: string | null;
  contact_id: string | null;
  job_type: string;
  run_at: string;
  endpoint: string;
  method: string;
  headers: Record<string, string>;
  payload: Record<string, unknown>;
  status: "scheduled" | "running" | "sent" | "failed" | "canceled";
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
  contact?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    contact_phones: { phone_normalized: string; is_primary: boolean }[];
  } | null;
}

export function useAutomationJobs(status?: string) {
  const { currentBrand, isAllBrandsSelected, allBrandIds, isQueryEnabled } = useBrandFilter();
  const brandId = currentBrand?.id;

  return useQuery({
    queryKey: ["automation-jobs", brandId, status],
    queryFn: async () => {
      let query = supabase
        .from("automation_jobs")
        .select(`
          *,
          contact:contacts(
            id, 
            first_name, 
            last_name, 
            contact_phones(phone_normalized, is_primary)
          )
        `)
        .order("run_at", { ascending: true });

      if (isAllBrandsSelected) {
        query = query.in("brand_id", allBrandIds);
      } else if (brandId) {
        query = query.eq("brand_id", brandId);
      }

      if (status) {
        query = query.eq("status", status);
      }

      const { data, error } = await query.limit(100);

      if (error) throw error;
      return data as AutomationJob[];
    },
    enabled: isQueryEnabled(),
  });
}

export function useUpdateJobRunAt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ jobId, runAt }: { jobId: string; runAt: string }) => {
      const { error } = await supabase
        .from("automation_jobs")
        .update({ run_at: runAt, updated_at: new Date().toISOString() })
        .eq("id", jobId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation-jobs"] });
      toast.success("Data di esecuzione aggiornata");
    },
    onError: (error) => {
      toast.error(`Errore: ${error.message}`);
    },
  });
}

export function useCancelJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (jobId: string) => {
      const { error } = await supabase
        .from("automation_jobs")
        .update({ status: "canceled", updated_at: new Date().toISOString() })
        .eq("id", jobId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation-jobs"] });
      toast.success("Job cancellato");
    },
    onError: (error) => {
      toast.error(`Errore: ${error.message}`);
    },
  });
}

export function useRetryJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ jobId, runAt }: { jobId: string; runAt?: string }) => {
      const { error } = await supabase
        .from("automation_jobs")
        .update({ 
          status: "scheduled", 
          run_at: runAt || new Date().toISOString(),
          attempts: 0,
          last_error: null,
          updated_at: new Date().toISOString() 
        })
        .eq("id", jobId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation-jobs"] });
      toast.success("Job riprogrammato");
    },
    onError: (error) => {
      toast.error(`Errore: ${error.message}`);
    },
  });
}
