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

      const trimmedSearch = filters.search?.trim() ?? "";

      // Use the trigram-indexed RPC when there is a free-text query
      // (full-text across entity_type, action, actor, correlation_id, changed_fields, metadata).
      if (trimmedSearch.length > 0) {
        const { data, error } = await supabase.rpc("search_audit_events", {
          p_brand_id: currentBrand.id,
          p_search: trimmedSearch,
          p_entity_type: filters.entityType ?? null,
          p_action: filters.action ?? null,
          p_actor_user_id: filters.actorUserId ?? null,
          p_date_from: filters.dateFrom ? filters.dateFrom.toISOString() : null,
          p_date_to: filters.dateTo
            ? (() => {
                const end = new Date(filters.dateTo);
                end.setHours(23, 59, 59, 999);
                return end.toISOString();
              })()
            : null,
          p_limit: PAGE_SIZE,
          p_offset: page * PAGE_SIZE,
        });

        if (error) throw error;

        const rows = (data ?? []) as Array<AuditEvent & { total_count: number }>;
        const total = rows.length > 0 ? Number(rows[0].total_count) : 0;
        // Strip the aggregated total_count from each row
        const events = rows.map(({ total_count: _omit, ...rest }) => rest as AuditEvent);

        return { events, total };
      }

      // No search → use direct table query (cheaper, leverages existing indexes).
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
