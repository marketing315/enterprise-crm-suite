import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import { useAuth } from "@/contexts/AuthContext";
import type { ActionSuggestion } from "@/types/predictive";

export function useActionSuggestions(entityType?: string, entityId?: string) {
  const { currentBrand } = useBrand();
  const { user } = useAuth();

  return useQuery({
    queryKey: ["action-suggestions", currentBrand?.id, entityType, entityId, user?.id],
    queryFn: async (): Promise<ActionSuggestion[]> => {
      if (!currentBrand) return [];

      let query = supabase
        .from("action_suggestions")
        .select("*")
        .eq("brand_id", currentBrand.id)
        .is("dismissed_at", null)
        .is("acted_on_at", null)
        .order("priority", { ascending: true })
        .order("confidence", { ascending: false });

      if (entityType && entityId) {
        query = query.eq("entity_type", entityType).eq("entity_id", entityId);
      }

      const { data, error } = await query.limit(20);

      if (error) throw error;
      return (data || []) as ActionSuggestion[];
    },
    enabled: !!currentBrand,
  });
}

export function useMyActionSuggestions() {
  const { currentBrand } = useBrand();
  const { user } = useAuth();

  return useQuery({
    queryKey: ["my-action-suggestions", currentBrand?.id, user?.id],
    queryFn: async (): Promise<ActionSuggestion[]> => {
      if (!currentBrand || !user) return [];

      const { data, error } = await supabase
        .from("action_suggestions")
        .select("*")
        .eq("brand_id", currentBrand.id)
        .or(`user_id.eq.${user.id},user_id.is.null`)
        .is("dismissed_at", null)
        .is("acted_on_at", null)
        .order("priority", { ascending: true })
        .order("confidence", { ascending: false })
        .limit(10);

      if (error) throw error;
      return (data || []) as ActionSuggestion[];
    },
    enabled: !!currentBrand && !!user,
  });
}

export function useDismissSuggestion() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (suggestionId: string) => {
      const { error } = await supabase
        .from("action_suggestions")
        .update({
          dismissed_at: new Date().toISOString(),
          dismissed_by: user?.id,
        })
        .eq("id", suggestionId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["action-suggestions"] });
      queryClient.invalidateQueries({ queryKey: ["my-action-suggestions"] });
    },
  });
}

export function useMarkSuggestionActed() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (suggestionId: string) => {
      const { error } = await supabase
        .from("action_suggestions")
        .update({
          acted_on_at: new Date().toISOString(),
          acted_on_by: user?.id,
        })
        .eq("id", suggestionId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["action-suggestions"] });
      queryClient.invalidateQueries({ queryKey: ["my-action-suggestions"] });
    },
  });
}
