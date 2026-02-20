import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import { useAuth } from "@/contexts/AuthContext";
import { untypedClient } from "@/integrations/supabase/untypedClient";

export interface UserModuleAccess {
  id: string;
  user_id: string;
  brand_id: string;
  module_key: string;
  is_enabled: boolean;
  updated_at: string;
}

export function useUserModuleAccessByBrand() {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ["user-module-access", currentBrand?.id],
    queryFn: async (): Promise<UserModuleAccess[]> => {
      if (!currentBrand?.id) return [];
      const { data, error } = await untypedClient
        .from("user_module_access")
        .select("*")
        .eq("brand_id", currentBrand.id);
      if (error) throw error;
      return (data || []) as unknown as UserModuleAccess[];
    },
    enabled: !!currentBrand?.id,
  });
}

export function useCurrentUserModuleAccess() {
  const { currentBrand } = useBrand();
  const { user } = useAuth();

  return useQuery({
    queryKey: ["user-module-access-me", currentBrand?.id, user?.id],
    queryFn: async (): Promise<UserModuleAccess[]> => {
      if (!currentBrand?.id || !user?.id) return [];
      const { data, error } = await untypedClient
        .from("user_module_access")
        .select("*")
        .eq("brand_id", currentBrand.id)
        .eq("user_id", user.id);
      if (error) throw error;
      return (data || []) as unknown as UserModuleAccess[];
    },
    enabled: !!currentBrand?.id && !!user?.id,
    staleTime: 5 * 60_000,
  });
}

export function useUpsertUserModuleAccess() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (params: {
      user_id: string;
      brand_id: string;
      module_key: string;
      is_enabled: boolean;
    }) => {
      const { error } = await untypedClient
        .from("user_module_access")
        .upsert(
          {
            user_id: params.user_id,
            brand_id: params.brand_id,
            module_key: params.module_key,
            is_enabled: params.is_enabled,
            updated_at: new Date().toISOString(),
            updated_by: user?.id || null,
          },
          { onConflict: "user_id,brand_id,module_key" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-module-access"] });
      queryClient.invalidateQueries({ queryKey: ["user-module-access-me"] });
    },
  });
}
