import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface AuditRetentionPolicy {
  id: string;
  brand_id: string;
  retention_months: number;
  archive_enabled: boolean;
  last_purge_at: string | null;
  last_archived_count: number | null;
  last_purged_count: number | null;
  created_at: string;
  updated_at: string;
}

export interface RetentionRunResult {
  executed_at: string;
  results: Array<{
    brand_id: string;
    retention_months: number;
    cutoff: string;
    archive_enabled: boolean;
    archived: number;
    purged: number;
    dry_run: boolean;
  }>;
}

export function useAuditRetentionPolicies() {
  return useQuery({
    queryKey: ["audit-retention-policies"],
    queryFn: async (): Promise<AuditRetentionPolicy[]> => {
      const { data, error } = await supabase
        .from("audit_retention_policies")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AuditRetentionPolicy[];
    },
    staleTime: 1000 * 30,
  });
}

export function useUpsertRetentionPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      brand_id: string;
      retention_months: number;
      archive_enabled: boolean;
    }) => {
      const { data, error } = await supabase.rpc("upsert_audit_retention_policy", {
        p_brand_id: input.brand_id,
        p_retention_months: input.retention_months,
        p_archive_enabled: input.archive_enabled,
      });
      if (error) throw error;
      return data as AuditRetentionPolicy;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["audit-retention-policies"] });
      toast.success("Policy salvata");
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Errore salvataggio";
      toast.error(msg);
    },
  });
}

export function useRunAuditRetention() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { brand_id?: string; dry_run: boolean }) => {
      const { data, error } = await supabase.rpc("run_audit_retention", {
        p_brand_id: input.brand_id ?? undefined,
        p_dry_run: input.dry_run,
      });
      if (error) throw error;
      return data as unknown as RetentionRunResult;
    },
    onSuccess: (data, vars) => {
      if (!vars.dry_run) {
        qc.invalidateQueries({ queryKey: ["audit-retention-policies"] });
        qc.invalidateQueries({ queryKey: ["audit-events"] });
      }
      const totalPurged = data.results.reduce((sum, r) => sum + (r.purged ?? 0), 0);
      const totalArchived = data.results.reduce((sum, r) => sum + (r.archived ?? 0), 0);
      toast.success(
        vars.dry_run
          ? `Simulazione: ${totalArchived} da archiviare, ${totalPurged} da rimuovere`
          : `Eseguito: archiviati ${totalArchived}, rimossi ${totalPurged}`
      );
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Errore esecuzione retention";
      toast.error(msg);
    },
  });
}
