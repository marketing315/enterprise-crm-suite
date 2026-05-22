import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { untypedClient } from "@/integrations/supabase/untypedClient";
import { supabase } from "@/integrations/supabase/client";

export type PerfSheetPeriod = "current_month" | "previous_month" | "last_30d" | "ytd";

export interface BrandPerfSheetConfig {
  id: string;
  brand_id: string;
  spreadsheet_id: string;
  spreadsheet_url: string;
  tab_name: string;
  period_mode: PerfSheetPeriod;
  cron_enabled: boolean;
  last_export_at: string | null;
  last_status: string | null;
  last_error: string | null;
  last_rows_exported: number | null;
  updated_at: string;
}

function extractSpreadsheetId(url: string): string | null {
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m?.[1] ?? null;
}

export function useBrandPerfSheetConfig(brandId: string | null) {
  return useQuery({
    queryKey: ["brand_perf_sheet_config", brandId],
    queryFn: async (): Promise<BrandPerfSheetConfig | null> => {
      if (!brandId) return null;
      const { data, error } = await untypedClient
        .from("brand_perf_sheet_config")
        .select("*")
        .eq("brand_id", brandId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as BrandPerfSheetConfig | null;
    },
    enabled: !!brandId,
  });
}

export function useSavePerfSheetConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      brand_id: string;
      spreadsheet_url: string;
      tab_name?: string;
      period_mode?: PerfSheetPeriod;
      cron_enabled?: boolean;
    }) => {
      const spreadsheet_id = extractSpreadsheetId(input.spreadsheet_url);
      if (!spreadsheet_id) throw new Error("URL Google Sheet non valido");

      const payload = {
        brand_id: input.brand_id,
        spreadsheet_id,
        spreadsheet_url: input.spreadsheet_url,
        tab_name: input.tab_name ?? "Performance",
        period_mode: input.period_mode ?? "current_month",
        cron_enabled: input.cron_enabled ?? true,
      };
      const { error } = await untypedClient
        .from("brand_perf_sheet_config")
        .upsert(payload, { onConflict: "brand_id" });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["brand_perf_sheet_config", vars.brand_id] });
    },
  });
}

export function useRunPerfSheetExport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { brand_id: string; period_mode?: PerfSheetPeriod }) => {
      const { data, error } = await supabase.functions.invoke("sheets-export-performance", {
        body: { brand_id: input.brand_id, period_mode: input.period_mode },
      });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data?.error || "Export fallito");
      return data as { ok: true; rows: number };
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["brand_perf_sheet_config", vars.brand_id] });
    },
  });
}
