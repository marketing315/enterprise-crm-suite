import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";

export interface AuditAccessEvent {
  id: string;
  brand_id: string | null;
  accessed_by: string;
  accessed_by_display_name: string | null;
  access_type: string;
  filters: Record<string, unknown>;
  result_count: number | null;
  reason: string | null;
  user_agent: string | null;
  accessed_at: string;
}

export interface AuditAccessLogData {
  total: number;
  limit: number;
  offset: number;
  events: AuditAccessEvent[];
  by_access_type: Array<{ access_type: string; count: number }>;
  top_users: Array<{
    user_id: string;
    display_name: string | null;
    count: number;
    last_access_at: string;
  }>;
  date_from: string;
  date_to: string;
}

export interface AuditAccessFilters {
  dateFrom?: Date;
  dateTo?: Date;
  accessType?: string;
  userId?: string;
}

export function useAuditAccessLog(filters: AuditAccessFilters = {}, page = 0) {
  const { currentBrand } = useBrand();
  const pageSize = 50;

  return useQuery({
    queryKey: [
      "audit-access-log",
      currentBrand?.id,
      filters.dateFrom?.toISOString(),
      filters.dateTo?.toISOString(),
      filters.accessType,
      filters.userId,
      page,
    ],
    queryFn: async (): Promise<AuditAccessLogData> => {
      const { data, error } = await supabase.rpc("get_audit_access_log", {
        p_brand_id: currentBrand?.id ?? null,
        p_date_from: filters.dateFrom?.toISOString() ?? null,
        p_date_to: filters.dateTo?.toISOString() ?? null,
        p_access_type: filters.accessType ?? null,
        p_user_id: filters.userId ?? null,
        p_limit: pageSize,
        p_offset: page * pageSize,
      });
      if (error) throw error;
      return data as unknown as AuditAccessLogData;
    },
    enabled: !!currentBrand,
    staleTime: 30_000,
  });
}
