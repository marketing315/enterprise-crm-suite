import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";

export interface AuditEvent {
  id: string;
  brand_id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor_user_id: string | null;
  actor_type: string;
  actor_display_name: string | null;
  source: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  changed_fields: string[] | null;
  metadata: Record<string, unknown>;
  correlation_id: string | null;
  occurred_at: string;
  created_at: string;
}

export interface AuditFilters {
  entityType?: string;
  entityId?: string;
  action?: string;
  actorUserId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  search?: string;
}

const PAGE_SIZE = 50;

export function useAuditEvents(filters: AuditFilters = {}, page = 0) {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ["audit-events", currentBrand?.id, filters, page],
    queryFn: async (): Promise<{ events: AuditEvent[]; total: number }> => {
      if (!currentBrand) return { events: [], total: 0 };

      let query = supabase
        .from("audit_events")
        .select("*", { count: "exact" })
        .eq("brand_id", currentBrand.id)
        .order("occurred_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (filters.entityType) {
        query = query.eq("entity_type", filters.entityType);
      }
      if (filters.entityId) {
        query = query.eq("entity_id", filters.entityId);
      }
      if (filters.action) {
        query = query.eq("action", filters.action);
      }
      if (filters.actorUserId) {
        query = query.eq("actor_user_id", filters.actorUserId);
      }
      if (filters.dateFrom) {
        query = query.gte("occurred_at", filters.dateFrom.toISOString());
      }
      if (filters.dateTo) {
        const end = new Date(filters.dateTo);
        end.setHours(23, 59, 59, 999);
        query = query.lte("occurred_at", end.toISOString());
      }
      if (filters.search && filters.search.trim().length >= 2) {
        // Trigram full-text search on precomputed search_text (gin_trgm_ops index)
        const term = filters.search.trim().replace(/[%_]/g, "\\$&");
        query = query.ilike("search_text", `%${term}%`);
      }

      const { data, error, count } = await query;
      if (error) throw error;

      return {
        events: (data || []) as unknown as AuditEvent[],
        total: count ?? 0,
      };
    },
    enabled: !!currentBrand,
    staleTime: 1000 * 15,
  });
}

export function useEntityAuditEvents(entityType: string, entityId: string | null) {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ["audit-events-entity", currentBrand?.id, entityType, entityId],
    queryFn: async (): Promise<AuditEvent[]> => {
      if (!currentBrand || !entityId) return [];

      const { data, error } = await supabase
        .from("audit_events")
        .select("*")
        .eq("brand_id", currentBrand.id)
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .order("occurred_at", { ascending: false })
        .limit(200);

      if (error) throw error;
      return (data || []) as unknown as AuditEvent[];
    },
    enabled: !!currentBrand && !!entityId,
    staleTime: 1000 * 15,
  });
}
