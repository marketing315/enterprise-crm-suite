import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import type { TableColumn, TableFilters, TableViewScope } from "@/hooks/useTableViews";

export type EntityViewsTable = "deal_table_views" | "ticket_table_views";

export interface EntityTableView {
  id: string;
  owner_user_id: string;
  brand_scope: TableViewScope;
  brand_id: string | null;
  name: string;
  columns: TableColumn[];
  filters: TableFilters;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Generic factory for table-view hooks. Mirrors useTableViews (contacts) but
 * lets us reuse the same shape for deal_table_views / ticket_table_views.
 */
export function createTableViewsHooks(table: EntityViewsTable, queryKeyPrefix: string) {
  function useViews() {
    const { user } = useAuth();
    return useQuery({
      queryKey: [queryKeyPrefix, user?.id],
      enabled: !!user,
      queryFn: async (): Promise<EntityTableView[]> => {
        if (!user) return [];
        const { data, error } = await supabase
          // @ts-expect-error - dynamic table name
          .from(table)
          .select("*")
          .eq("owner_user_id", user.id)
          .order("name");
        if (error) throw error;
        return (data || []).map((v: Record<string, unknown>) => ({
          id: v.id as string,
          owner_user_id: v.owner_user_id as string,
          brand_scope: v.brand_scope as TableViewScope,
          brand_id: (v.brand_id as string | null) ?? null,
          name: v.name as string,
          columns: (v.columns || []) as TableColumn[],
          filters: (v.filters || {}) as TableFilters,
          is_default: Boolean(v.is_default),
          created_at: v.created_at as string,
          updated_at: v.updated_at as string,
        }));
      },
    });
  }

  function useCreate() {
    const { user } = useAuth();
    const qc = useQueryClient();
    const { toast } = useToast();
    return useMutation({
      mutationFn: async (params: {
        name: string;
        columns: TableColumn[];
        filters?: TableFilters;
        is_default?: boolean;
      }) => {
        if (!user) throw new Error("Not authenticated");
        const { data, error } = await supabase
          // @ts-expect-error - dynamic table name
          .from(table)
          .insert({
            owner_user_id: user.id,
            brand_scope: "all_accessible",
            brand_id: null,
            name: params.name,
            columns: params.columns as never,
            filters: (params.filters || {}) as never,
            is_default: params.is_default || false,
          })
          .select()
          .single();
        if (error) throw error;
        return data;
      },
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: [queryKeyPrefix] });
        toast({ title: "Vista salvata" });
      },
      onError: (e: Error) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
    });
  }

  function useUpdate() {
    const qc = useQueryClient();
    const { toast } = useToast();
    return useMutation({
      mutationFn: async (params: {
        id: string;
        updates: Partial<{ name: string; columns: TableColumn[]; filters: TableFilters; is_default: boolean }>;
      }) => {
        const { data, error } = await supabase
          // @ts-expect-error - dynamic table name
          .from(table)
          .update(params.updates as never)
          .eq("id", params.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      },
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: [queryKeyPrefix] });
        toast({ title: "Vista aggiornata" });
      },
      onError: (e: Error) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
    });
  }

  function useDelete() {
    const qc = useQueryClient();
    const { toast } = useToast();
    return useMutation({
      mutationFn: async (id: string) => {
        const { error } = await supabase
          // @ts-expect-error - dynamic table name
          .from(table)
          .delete()
          .eq("id", id);
        if (error) throw error;
      },
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: [queryKeyPrefix] });
        toast({ title: "Vista eliminata" });
      },
      onError: (e: Error) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
    });
  }

  return { useViews, useCreate, useUpdate, useDelete };
}
