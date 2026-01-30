import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import { useToast } from "@/hooks/use-toast";

export type TableViewScope = "single_brand" | "all_accessible";

export interface TableColumn {
  key: string;
  label: string;
  width?: number;
  pinned?: boolean;
  visible?: boolean;
}

export interface TableFilters {
  status?: string;
  tagIds?: string[];
  [key: string]: unknown;
}

export interface ContactTableView {
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

// Default columns configuration
export const DEFAULT_COLUMNS: TableColumn[] = [
  { key: "full_name", label: "Nome", visible: true },
  { key: "primary_phone", label: "Telefono", visible: true },
  { key: "email", label: "Email", visible: true },
  { key: "city", label: "Città", visible: true },
  { key: "status", label: "Stato", visible: true },
  { key: "brand_name", label: "Brand", visible: false }, // Hidden by default, shown in all-brands view
  { key: "created_at", label: "Data", visible: true },
];

export function useTableViews() {
  const { user } = useAuth();
  const { currentBrand, isAllBrandsSelected } = useBrand();

  return useQuery({
    queryKey: ["table-views", user?.id, currentBrand?.id],
    queryFn: async (): Promise<ContactTableView[]> => {
      if (!user) return [];

      let query = supabase
        .from("contact_table_views")
        .select("*")
        .eq("owner_user_id", user.id)
        .order("name");

      // Filter by current context
      if (isAllBrandsSelected) {
        query = query.eq("brand_scope", "all_accessible");
      } else if (currentBrand) {
        query = query.or(`brand_scope.eq.all_accessible,brand_id.eq.${currentBrand.id}`);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data || []).map((v) => ({
        id: v.id,
        owner_user_id: v.owner_user_id,
        brand_scope: v.brand_scope as TableViewScope,
        brand_id: v.brand_id,
        name: v.name,
        columns: (v.columns || DEFAULT_COLUMNS) as TableColumn[],
        filters: (v.filters || {}) as TableFilters,
        is_default: v.is_default,
        created_at: v.created_at,
        updated_at: v.updated_at,
      }));
    },
    enabled: !!user,
  });
}

export function useDefaultTableView() {
  const { data: views = [] } = useTableViews();
  const { isAllBrandsSelected } = useBrand();

  // Find default view, or return null to use default columns
  const defaultView = views.find((v) => v.is_default);
  
  if (defaultView) {
    return defaultView;
  }

  // Return a synthetic default view
  const columns = DEFAULT_COLUMNS.map((col) => ({
    ...col,
    // Show brand column by default in all-brands view
    visible: col.key === "brand_name" ? isAllBrandsSelected : col.visible,
  }));

  return {
    id: "default",
    owner_user_id: "",
    brand_scope: isAllBrandsSelected ? "all_accessible" : "single_brand" as TableViewScope,
    brand_id: null,
    name: "Vista predefinita",
    columns,
    filters: {},
    is_default: true,
    created_at: "",
    updated_at: "",
  };
}

export function useCreateTableView() {
  const { user } = useAuth();
  const { currentBrand, isAllBrandsSelected } = useBrand();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: {
      name: string;
      columns: TableColumn[];
      filters?: TableFilters;
      is_default?: boolean;
    }) => {
      if (!user) throw new Error("Not authenticated");

      const insertData = {
        owner_user_id: user.id,
        brand_scope: isAllBrandsSelected ? "all_accessible" : "single_brand",
        brand_id: isAllBrandsSelected ? null : currentBrand?.id,
        name: params.name,
        columns: params.columns,
        filters: params.filters || {},
        is_default: params.is_default || false,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await supabase
        .from("contact_table_views")
        .insert(insertData as any)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["table-views"] });
      toast({ title: "Vista salvata" });
    },
    onError: (error) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });
}

export function useUpdateTableView() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: {
      id: string;
      updates: Partial<{
        name: string;
        columns: TableColumn[];
        filters: TableFilters;
        is_default: boolean;
      }>;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await supabase
        .from("contact_table_views")
        .update(params.updates as any)
        .eq("id", params.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["table-views"] });
      toast({ title: "Vista aggiornata" });
    },
    onError: (error) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });
}

export function useDeleteTableView() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (viewId: string) => {
      const { error } = await supabase
        .from("contact_table_views")
        .delete()
        .eq("id", viewId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["table-views"] });
      toast({ title: "Vista eliminata" });
    },
    onError: (error) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });
}
