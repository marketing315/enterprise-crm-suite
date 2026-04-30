import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import { toast } from "sonner";

export interface RestoreSummaryItem {
  table: string;
  in_archive: number;
  would_insert?: number;
  conflicts?: number;
  inserted?: number;
  skipped?: number;
  errors?: number;
  strategy: string;
}

export interface RestoreResult {
  ok: boolean;
  run_id: string;
  mode: "dry_run" | "apply";
  manifest: {
    version: string;
    source_brand_id: string;
    source_scope: string;
    generated_at: string;
    run_id: string;
  };
  summary: RestoreSummaryItem[];
  total_in_archive: number;
  total_inserted: number;
  total_skipped: number;
  duration_ms: number;
}

export interface RestoreRunRow {
  id: string;
  brand_id: string;
  triggered_by_user_id: string | null;
  source_filename: string | null;
  source_run_id: string | null;
  source_brand_id: string | null;
  source_scope: string | null;
  mode: "dry_run" | "apply";
  conflict_strategy: "skip" | "overwrite";
  tables_selected: string[];
  tables_summary: RestoreSummaryItem[];
  total_rows_in_archive: number;
  total_rows_inserted: number;
  total_rows_skipped: number;
  duration_ms: number;
  status: "running" | "completed" | "failed";
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

interface RunRestoreInput {
  file: File;
  mode: "dry_run" | "apply";
  conflictStrategy?: "skip" | "overwrite";
  tables?: string[];
}

async function fileToBase64(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  // chunked btoa per evitare stack overflow su file grandi
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < buf.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + CHUNK)) as number[]);
  }
  return btoa(binary);
}

export function useRunRestore() {
  const { currentBrand } = useBrand();
  const qc = useQueryClient();

  return useMutation<RestoreResult, Error, RunRestoreInput>({
    mutationFn: async ({ file, mode, conflictStrategy = "skip", tables }) => {
      if (!currentBrand?.id) throw new Error("Nessun brand selezionato");
      const archive_base64 = await fileToBase64(file);
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Sessione scaduta");

      const url = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/quick-restore-runner`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          brand_id: currentBrand.id,
          mode,
          conflict_strategy: conflictStrategy,
          tables,
          archive_base64,
        }),
      });
      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const j = await res.json();
          detail = j.detail ?? j.error ?? detail;
        } catch {}
        throw new Error(detail);
      }
      return (await res.json()) as RestoreResult;
    },
    onSuccess: (res) => {
      if (res.mode === "apply") {
        toast.success("Restore completato", {
          description: `${res.total_inserted.toLocaleString("it-IT")} righe inserite • ${res.total_skipped} saltate`,
        });
        qc.invalidateQueries();
      } else {
        toast.success("Anteprima pronta", {
          description: `${res.total_in_archive.toLocaleString("it-IT")} righe nell'archivio`,
        });
      }
      qc.invalidateQueries({ queryKey: ["restore_runs"] });
    },
    onError: (err) => {
      toast.error("Restore fallito", { description: err.message });
    },
  });
}

export function useRestoreRuns() {
  const { currentBrand } = useBrand();
  return useQuery({
    queryKey: ["restore_runs", currentBrand?.id],
    queryFn: async (): Promise<RestoreRunRow[]> => {
      if (!currentBrand?.id) return [];
      const { data, error } = await supabase
        .from("restore_runs")
        .select("*")
        .eq("brand_id", currentBrand.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as RestoreRunRow[];
    },
    enabled: !!currentBrand?.id,
    staleTime: 30_000,
  });
}
