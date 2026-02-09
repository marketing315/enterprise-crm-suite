import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import { useWriteBrandId } from "@/hooks/useWriteBrandId";
import type { Database } from "@/integrations/supabase/types";

type AdminTodo = Database["public"]["Tables"]["admin_todos"]["Row"];

export function useAdminTodos() {
  const { currentBrand, hasBrandSelected, isAllBrandsSelected, allBrandIds } = useBrand();
  const queryClient = useQueryClient();

  // For single brand: use that brand's ID
  // For "all brands": fetch todos from all accessible brands
  const brandId = hasBrandSelected && !isAllBrandsSelected ? currentBrand?.id : null;

  const { data: todos = [], isLoading } = useQuery({
    queryKey: ["admin-todos", brandId, isAllBrandsSelected, allBrandIds],
    queryFn: async () => {
      if (!hasBrandSelected) return [];
      
      let query = supabase
        .from("admin_todos")
        .select("*")
        .order("completed", { ascending: true })
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: false });
      
      if (isAllBrandsSelected) {
        // Fetch from all accessible brands
        if (allBrandIds.length > 0) {
          query = query.in("brand_id", allBrandIds);
        } else {
          return [];
        }
      } else if (brandId) {
        query = query.eq("brand_id", brandId);
      } else {
        return [];
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data || []) as AdminTodo[];
    },
    enabled: hasBrandSelected,
  });

  const { getWriteBrandId } = useWriteBrandId();

  const addTodo = useMutation({
    mutationFn: async (title: string) => {
      const targetBrandId = getWriteBrandId();

      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not authenticated");

      // Get user_id from users table using RPC
      const { data: userId, error: rpcError } = await supabase.rpc("get_user_id", { 
        _auth_uid: userData.user.id 
      });

      if (rpcError || !userId) throw new Error("User not found");

      const { error } = await supabase.from("admin_todos").insert({
        brand_id: targetBrandId,
        created_by: userId,
        title,
        display_order: todos.length,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-todos"] });
    },
  });

  const toggleTodo = useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }) => {
      const { error } = await supabase
        .from("admin_todos")
        .update({
          completed,
          completed_at: completed ? new Date().toISOString() : null,
        })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-todos"] });
    },
  });

  const deleteTodo = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("admin_todos")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-todos"] });
    },
  });

  return {
    todos,
    isLoading,
    addTodo,
    toggleTodo,
    deleteTodo,
  };
}
