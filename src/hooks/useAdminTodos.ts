import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import type { Database } from "@/integrations/supabase/types";

type AdminTodo = Database["public"]["Tables"]["admin_todos"]["Row"];

export function useAdminTodos() {
  const { currentBrand, hasBrandSelected, isAllBrandsSelected } = useBrand();
  const brandId = hasBrandSelected && !isAllBrandsSelected ? currentBrand?.id : null;
  const queryClient = useQueryClient();

  const { data: todos = [], isLoading } = useQuery({
    queryKey: ["admin-todos", brandId],
    queryFn: async () => {
      if (!brandId) return [];
      
      const { data, error } = await supabase
        .from("admin_todos")
        .select("*")
        .eq("brand_id", brandId)
        .order("completed", { ascending: true })
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as AdminTodo[];
    },
    enabled: !!brandId,
  });

  const addTodo = useMutation({
    mutationFn: async (title: string) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user || !brandId) throw new Error("Not authenticated");

      // Get user_id from users table using RPC
      const { data: userId, error: rpcError } = await supabase.rpc("get_user_id", { 
        _auth_uid: userData.user.id 
      });

      if (rpcError || !userId) throw new Error("User not found");

      const { error } = await supabase.from("admin_todos").insert({
        brand_id: brandId,
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
