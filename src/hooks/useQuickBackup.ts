import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import { toast } from "sonner";

export type BackupScope = "minimal" | "standard" | "full";

export interface BackupRunRow {
  id: string;
  brand_id: string;
  scope: BackupScope;
  triggered_by_user_id: string | null;
  tables_included: string[];
  total_rows: number;
  size_bytes: number;
  duration_ms: number;
  status: "running" | "completed" | "failed";
  error: string | null;
  checksum: string | null;
  truncated_tables: string[];
  created_at: string;
  completed_at: string | null;
}

export const SCOPE_DESCRIPTIONS: Record<BackupScope, { label: string; tables: string[]; hint: string }> = {
  minimal: {
    label: "Minimal",
    tables: ["contacts", "contact_phones", "contact_emails", "deals", "appointments"],
    hint: "Anagrafiche e attività operative. Veloce (< 5s).",
  },
  standard: {
    label: "Standard",
    tables: [
      "contacts", "contact_phones", "contact_emails", "deals", "appointments",
      "lead_events", "audit_events", "appointment_outcomes",
      "contact_field_values", "deal_stage_history",
    ],
    hint: "Anagrafiche + storico eventi e audit. Consigliato.",
  },
  full: {
    label: "Full",
    tables: [
      "contacts", "contact_phones", "contact_emails", "deals", "appointments",
      "lead_events", "audit_events", "appointment_outcomes",
      "contact_field_values", "deal_stage_history",
      "notifications", "tickets", "ticket_events", "ai_decision_logs", "lead_scores",
    ],
    hint: "Snapshot completo. Più lento (~ 15-30s).",
  },
};

export function useBackupRuns() {
  const { currentBrand } = useBrand();
  return useQuery({
    queryKey: ["backup_runs", currentBrand?.id],
    queryFn: async (): Promise<BackupRunRow[]> => {
      if (!currentBrand?.id) return [];
      const { data, error } = await supabase
        .from("backup_runs")
        .select("*")
        .eq("brand_id", currentBrand.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as BackupRunRow[];
    },
    enabled: !!currentBrand?.id,
    staleTime: 30_000,
  });
}

export function useRunQuickBackup() {
  const { currentBrand } = useBrand();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (scope: BackupScope) => {
      if (!currentBrand?.id) throw new Error("Nessun brand selezionato");
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Sessione scaduta");

      const url = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/quick-backup-runner`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ brand_id: currentBrand.id, scope }),
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const j = await res.json();
          msg = j.error ?? j.detail ?? msg;
        } catch {}
        throw new Error(msg);
      }
      const blob = await res.blob();
      const runId = res.headers.get("X-Backup-Run-Id") ?? "run";
      const totalRows = res.headers.get("X-Backup-Total-Rows") ?? "?";

      // Trigger download
      const link = document.createElement("a");
      const objUrl = URL.createObjectURL(blob);
      link.href = objUrl;
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      link.download = `backup-${scope}-${currentBrand.id.slice(0, 8)}-${ts}.tar.gz`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(objUrl), 5_000);

      return { runId, totalRows: Number(totalRows), bytes: blob.size };
    },
    onSuccess: (res) => {
      const mb = (res.bytes / (1024 * 1024)).toFixed(2);
      toast.success(`Backup pronto`, {
        description: `${res.totalRows.toLocaleString("it-IT")} righe • ${mb} MB`,
      });
      qc.invalidateQueries({ queryKey: ["backup_runs"] });
    },
    onError: (err: Error) => {
      toast.error("Backup fallito", { description: err.message });
    },
  });
}
