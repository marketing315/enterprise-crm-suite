import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrandFilter } from "./useBrandFilter";
import { toast } from "sonner";

export type ComplianceReportType = "gdpr" | "sox" | "custom";

export interface ComplianceReportListItem {
  id: string;
  report_type: ComplianceReportType;
  period_start: string;
  period_end: string;
  generated_at: string;
  generated_by: string | null;
  checksum: string;
  notes: string | null;
  total_events: number;
}

export interface ComplianceReportDetail {
  id: string;
  brand_id: string;
  report_type: ComplianceReportType;
  period_start: string;
  period_end: string;
  generated_at: string;
  generated_by: string | null;
  summary: {
    total_events: number;
    by_action: Record<string, number>;
    by_entity_type: Record<string, number>;
    top_users: Array<{ user_id: string; count: number }>;
    critical: {
      exports: number;
      deletions: number;
      permission_changes: number;
      pii_access: number;
      anomalies: number;
    };
    meta: {
      report_type: string;
      period_start: string;
      period_end: string;
      generated_at: string;
    };
  };
  checksum: string;
  notes: string | null;
}

export function useComplianceReports(reportType?: ComplianceReportType) {
  const { effectiveBrandId } = useBrandFilter();
  return useQuery({
    queryKey: ["compliance-reports", effectiveBrandId, reportType ?? "all"],
    queryFn: async (): Promise<ComplianceReportListItem[]> => {
      if (!effectiveBrandId) return [];
      const { data, error } = await supabase.rpc("list_compliance_reports", {
        p_brand_id: effectiveBrandId,
        p_report_type: reportType ?? null,
        p_limit: 100,
      });
      if (error) throw error;
      return (data ?? []) as ComplianceReportListItem[];
    },
    enabled: !!effectiveBrandId,
    staleTime: 1000 * 30,
  });
}

export function useComplianceReportDetail(reportId: string | null) {
  return useQuery({
    queryKey: ["compliance-report-detail", reportId],
    queryFn: async (): Promise<ComplianceReportDetail | null> => {
      if (!reportId) return null;
      const { data, error } = await supabase.rpc("get_compliance_report", {
        p_report_id: reportId,
      });
      if (error) throw error;
      return data as ComplianceReportDetail;
    },
    enabled: !!reportId,
    staleTime: 1000 * 60 * 5,
  });
}

interface GenerateReportInput {
  reportType: ComplianceReportType;
  periodStart: string;
  periodEnd: string;
  notes?: string;
}

export function useGenerateComplianceReport() {
  const qc = useQueryClient();
  const { effectiveBrandId } = useBrandFilter();

  return useMutation({
    mutationFn: async (input: GenerateReportInput) => {
      if (!effectiveBrandId) throw new Error("Brand non selezionato");
      const { data, error } = await supabase.rpc("generate_compliance_report", {
        p_brand_id: effectiveBrandId,
        p_report_type: input.reportType,
        p_period_start: input.periodStart,
        p_period_end: input.periodEnd,
        p_notes: input.notes ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["compliance-reports"] });
      toast.success("Report generato");
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Errore generazione report");
    },
  });
}

export function useDeleteComplianceReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("audit_compliance_reports")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["compliance-reports"] });
      toast.success("Report eliminato");
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Errore eliminazione");
    },
  });
}
