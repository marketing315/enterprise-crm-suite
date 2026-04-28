import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";

export interface AuditAccessLogEntry {
  id: string;
  brand_id: string;
  accessed_by: string;
  accessed_by_display_name: string | null;
  access_type: string;
  filters: Record<string, unknown> | null;
  result_count: number | null;
  reason: string | null;
  user_agent: string | null;
  accessed_at: string;
}

export interface AuditAccessLogFilters {
  dateFrom?: Date;
  dateTo?: Date;
  accessType?: string;
  userId?: string;
}

export function useAuditAccessLog(filters: AuditAccessLogFilters = {}, page = 0, pageSize = 50) {
  const { currentBrand } = useBrand();
  return useQuery({
    queryKey: ["audit-access-log", currentBrand?.id, filters, page],
    queryFn: async (): Promise<{ entries: AuditAccessLogEntry[]; total: number }> => {
      if (!currentBrand) return { entries: [], total: 0 };
      const { data, error } = await supabase.rpc("get_audit_access_log", {
        p_brand_id: currentBrand.id,
        p_date_from: filters.dateFrom?.toISOString() ?? null,
        p_date_to: filters.dateTo?.toISOString() ?? null,
        p_access_type: filters.accessType ?? null,
        p_user_id: filters.userId ?? null,
        p_limit: pageSize,
        p_offset: page * pageSize,
      });
      if (error) throw error;
      const payload = data as { entries?: AuditAccessLogEntry[]; total?: number } | null;
      return {
        entries: payload?.entries ?? [],
        total: payload?.total ?? 0,
      };
    },
    enabled: !!currentBrand,
    staleTime: 1000 * 30,
  });
}
