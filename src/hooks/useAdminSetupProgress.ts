import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type SetupStepKey =
  | "brand_created"
  | "users_invited"
  | "webhook_source_created"
  | "ticket_sla_configured"
  | "integration_connected"
  | "dismissed";

export interface AdminSetupProgress {
  user_id: string;
  manual: {
    brand_created_at: string | null;
    users_invited_at: string | null;
    webhook_source_created_at: string | null;
    ticket_sla_configured_at: string | null;
    integration_connected_at: string | null;
    dismissed_at: string | null;
  };
  auto_detected: Record<Exclude<SetupStepKey, "dismissed">, boolean>;
  counts: {
    brands: number;
    users: number;
    webhook_sources: number;
    ticket_policies: number;
    integrations: number;
  };
}

export const SETUP_STEPS: Exclude<SetupStepKey, "dismissed">[] = [
  "brand_created",
  "users_invited",
  "webhook_source_created",
  "ticket_sla_configured",
  "integration_connected",
];

export function isStepComplete(progress: AdminSetupProgress | undefined, step: Exclude<SetupStepKey, "dismissed">): boolean {
  if (!progress) return false;
  const manualKey = `${step}_at` as keyof AdminSetupProgress["manual"];
  return Boolean(progress.manual[manualKey]) || Boolean(progress.auto_detected[step]);
}

export function useAdminSetupProgress() {
  const { isAdmin } = useAuth();
  return useQuery({
    queryKey: ["admin-setup-progress"],
    enabled: isAdmin,
    staleTime: 30_000,
    queryFn: async (): Promise<AdminSetupProgress> => {
      const { data, error } = await supabase.rpc("get_admin_setup_progress" as never);
      if (error) throw error;
      return data as unknown as AdminSetupProgress;
    },
  });
}

export function useMarkSetupStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (step: SetupStepKey) => {
      const { error } = await supabase.rpc("mark_admin_setup_step" as never, { p_step: step } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-setup-progress"] });
    },
  });
}
