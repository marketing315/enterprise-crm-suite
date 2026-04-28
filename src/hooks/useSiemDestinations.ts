import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import { toast } from "sonner";

export interface SiemDestination {
  id: string;
  brand_id: string;
  name: string;
  endpoint_url: string;
  hmac_secret: string;
  is_active: boolean;
  entity_types_filter: string[] | null;
  actions_filter: string[] | null;
  mask_pii: boolean;
  batch_size: number;
  last_exported_at: string;
  last_success_at: string | null;
  last_error: string | null;
  consecutive_failures: number;
  created_at: string;
  updated_at: string;
}

export interface SiemExportLogEntry {
  id: string;
  destination_id: string;
  brand_id: string;
  events_count: number;
  status: "success" | "failed" | "partial";
  http_status: number | null;
  error_message: string | null;
  latency_ms: number | null;
  exported_from: string | null;
  exported_to: string | null;
  created_at: string;
}

export function useSiemDestinations() {
  const { currentBrand } = useBrand();
  return useQuery({
    queryKey: ["siem-destinations", currentBrand?.id],
    queryFn: async (): Promise<SiemDestination[]> => {
      if (!currentBrand) return [];
      const { data, error } = await supabase
        .from("siem_destinations")
        .select("*")
        .eq("brand_id", currentBrand.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SiemDestination[];
    },
    enabled: !!currentBrand,
    staleTime: 30_000,
  });
}

export function useSiemExportLog(destinationId: string | null) {
  return useQuery({
    queryKey: ["siem-export-log", destinationId],
    queryFn: async (): Promise<SiemExportLogEntry[]> => {
      if (!destinationId) return [];
      const { data, error } = await supabase
        .from("siem_export_log")
        .select("*")
        .eq("destination_id", destinationId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as SiemExportLogEntry[];
    },
    enabled: !!destinationId,
    staleTime: 15_000,
  });
}

export function useSaveSiemDestination() {
  const qc = useQueryClient();
  const { currentBrand } = useBrand();
  return useMutation({
    mutationFn: async (input: Partial<SiemDestination> & { id?: string }) => {
      if (!currentBrand) throw new Error("No brand selected");
      if (input.id) {
        const { error } = await supabase
          .from("siem_destinations")
          .update({
            name: input.name,
            endpoint_url: input.endpoint_url,
            hmac_secret: input.hmac_secret,
            is_active: input.is_active,
            entity_types_filter: input.entity_types_filter,
            actions_filter: input.actions_filter,
            mask_pii: input.mask_pii,
            batch_size: input.batch_size,
          })
          .eq("id", input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("siem_destinations").insert({
          brand_id: currentBrand.id,
          name: input.name!,
          endpoint_url: input.endpoint_url!,
          hmac_secret: input.hmac_secret!,
          is_active: input.is_active ?? true,
          entity_types_filter: input.entity_types_filter ?? null,
          actions_filter: input.actions_filter ?? null,
          mask_pii: input.mask_pii ?? true,
          batch_size: input.batch_size ?? 100,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["siem-destinations"] });
      toast.success("Destinazione SIEM salvata");
    },
    onError: (e: Error) => toast.error(`Errore: ${e.message}`),
  });
}

export function useDeleteSiemDestination() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("siem_destinations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["siem-destinations"] });
      toast.success("Destinazione eliminata");
    },
    onError: (e: Error) => toast.error(`Errore: ${e.message}`),
  });
}

export function useTriggerSiemExport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("siem-exporter", { body: {} });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["siem-destinations"] });
      qc.invalidateQueries({ queryKey: ["siem-export-log"] });
      toast.success(`Export completato: ${data?.total_events ?? 0} eventi inviati`);
    },
    onError: (e: Error) => toast.error(`Errore export: ${e.message}`),
  });
}
