import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type MaskStrategy = "full" | "partial" | "hash" | "none";

export interface PiiPolicy {
  id: string;
  field_pattern: string;
  strategy: MaskStrategy;
  exempt_roles: string[];
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface EffectivePiiRule {
  field_pattern: string;
  strategy: MaskStrategy;
  description: string | null;
}

/**
 * Effective PII rules for the current user — used by AuditDiffViewer to mask values.
 */
export function useEffectivePiiPolicies() {
  return useQuery({
    queryKey: ["audit-pii-policies-effective"],
    queryFn: async (): Promise<EffectivePiiRule[]> => {
      const { data, error } = await supabase.rpc("get_audit_pii_policies_for_role");
      if (error) throw error;
      return (data ?? []) as EffectivePiiRule[];
    },
    staleTime: 1000 * 60 * 5,
  });
}

/**
 * All policies — admin-only management view.
 */
export function useAllPiiPolicies() {
  return useQuery({
    queryKey: ["audit-pii-policies-all"],
    queryFn: async (): Promise<PiiPolicy[]> => {
      const { data, error } = await supabase
        .from("audit_pii_policies")
        .select("*")
        .order("field_pattern", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PiiPolicy[];
    },
    staleTime: 1000 * 30,
  });
}

export function useUpsertPiiPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<PiiPolicy> & { field_pattern: string; strategy: MaskStrategy }) => {
      const { data, error } = await supabase
        .from("audit_pii_policies")
        .upsert(
          {
            field_pattern: input.field_pattern,
            strategy: input.strategy,
            exempt_roles: input.exempt_roles ?? [],
            description: input.description ?? null,
            is_active: input.is_active ?? true,
          },
          { onConflict: "field_pattern" }
        )
        .select()
        .single();
      if (error) throw error;
      return data as PiiPolicy;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["audit-pii-policies-all"] });
      qc.invalidateQueries({ queryKey: ["audit-pii-policies-effective"] });
      toast.success("Policy salvata");
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Errore salvataggio");
    },
  });
}

export function useDeletePiiPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("audit_pii_policies").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["audit-pii-policies-all"] });
      qc.invalidateQueries({ queryKey: ["audit-pii-policies-effective"] });
      toast.success("Policy eliminata");
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Errore eliminazione");
    },
  });
}
