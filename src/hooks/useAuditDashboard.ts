import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";

export interface AuditDashboardStats {
  total: number;
  by_action: Array<{ action: string; count: number }>;
  by_entity: Array<{ entity_type: string; count: number }>;
  by_actor: Array<{
    actor_user_id: string;
    actor_display_name: string | null;
    count: number;
  }>;
  by_day: Array<{ day: string; count: number }>;
}

export interface AuditAnomalies {
  lookback_hours: number;
  generated_at: string;
  mass_export: Array<{
    accessed_by: string;
    accessed_by_display_name: string | null;
    result_count: number;
    accessed_at: string;
    access_type: string;
  }>;
  mass_delete: Array<{
    actor_user_id: string;
    actor_display_name: string | null;
    delete_count: number;
    window_start: string;
  }>;
  off_hours: Array<{
    actor_user_id: string;
    actor_display_name: string | null;
    action_count: number;
    sample_at: string;
  }>;
}

export function useAuditDashboardStats(dateFrom?: Date, dateTo?: Date) {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ["audit-dashboard-stats", currentBrand?.id, dateFrom?.toISOString(), dateTo?.toISOString()],
    queryFn: async (): Promise<AuditDashboardStats> => {
      if (!currentBrand) {
        return { total: 0, by_action: [], by_entity: [], by_actor: [], by_day: [] };
      }
      const { data, error } = await supabase.rpc("get_audit_dashboard_stats", {
        p_brand_id: currentBrand.id,
        p_date_from: dateFrom?.toISOString() ?? new Date(Date.now() - 30 * 86400000).toISOString(),
        p_date_to: (dateTo ?? new Date()).toISOString(),
      });
      if (error) throw error;
      return data as unknown as AuditDashboardStats;
    },
    enabled: !!currentBrand,
    staleTime: 1000 * 60,
  });
}

export function useAuditAnomalies(lookbackHours = 24) {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ["audit-anomalies", currentBrand?.id, lookbackHours],
    queryFn: async (): Promise<AuditAnomalies> => {
      if (!currentBrand) {
        return {
          lookback_hours: lookbackHours,
          generated_at: new Date().toISOString(),
          mass_export: [],
          mass_delete: [],
          off_hours: [],
        };
      }
      const { data, error } = await supabase.rpc("detect_audit_anomalies", {
        p_brand_id: currentBrand.id,
        p_lookback_hours: lookbackHours,
      });
      if (error) throw error;
      return data as unknown as AuditAnomalies;
    },
    enabled: !!currentBrand,
    staleTime: 1000 * 60,
  });
}

export async function logAuditAccess(
  brandId: string | null,
  accessType: "console_view" | "export" | "entity_timeline" | "unified_timeline" | "dashboard" | "anomaly_check",
  filters: Record<string, unknown> = {},
  resultCount?: number,
  reason?: string,
) {
  if (!brandId) return;
  try {
    await supabase.rpc("log_audit_access", {
      p_brand_id: brandId,
      p_access_type: accessType,
      p_filters: filters as never,
      p_result_count: resultCount ?? null,
      p_reason: reason ?? null,
      p_user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 255) : null,
    });
  } catch {
    // best-effort, never block user action
  }
}
