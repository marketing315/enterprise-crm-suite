import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { BrandWithHierarchy } from "@/types/database";

export function useBrandHierarchy() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["brand-hierarchy", user?.id],
    queryFn: async (): Promise<BrandWithHierarchy[]> => {
      if (!user) return [];

      const { data, error } = await supabase.rpc("get_brands_with_hierarchy", {
        p_user_id: user.id,
      });

      if (error) throw error;

      return (data || []).map((b: Record<string, unknown>) => ({
        id: b.id as string,
        name: b.name as string,
        slug: b.slug as string,
        parent_brand_id: b.parent_brand_id as string | null,
        parent_brand_name: b.parent_brand_name as string | null,
        is_parent: b.is_parent as boolean,
        child_count: b.child_count as number,
        auto_assign_enabled: false,
        sla_thresholds_minutes: {},
        created_at: "",
        updated_at: "",
      }));
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 5,
  });
}

export function useAccessibleBrandIds() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["accessible-brand-ids", user?.id],
    queryFn: async (): Promise<string[]> => {
      if (!user) return [];

      const { data, error } = await supabase.rpc("get_accessible_brand_ids", {
        p_user_id: user.id,
      });

      if (error) throw error;
      return (data || []) as string[];
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 5,
  });
}
