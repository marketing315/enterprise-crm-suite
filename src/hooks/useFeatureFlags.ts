import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import { useAuth } from "@/contexts/AuthContext";
import { useCallback, useEffect, useRef } from "react";
import { useCurrentUserModuleAccess } from "@/hooks/useUserModuleAccess";

export type ModuleStatus = "active" | "maintain" | "evaluate" | "frozen" | "sunset";

export interface FeatureFlag {
  id: string;
  brand_id: string;
  module_key: string;
  module_label: string;
  status: ModuleStatus;
  frozen_message: string | null;
  frozen_redirect: string | null;
  updated_at: string;
}

export interface ModuleAdoptionStat {
  module_key: string;
  total_events: number;
  unique_users: number;
  last_used: string;
  avg_daily: number;
}

// Map route paths to module keys
const ROUTE_MODULE_MAP: Record<string, string> = {
  "/chat": "chat_team",
  "/admin/capi": "capi_monitor",
  "/admin/callcenter-kpi": "callcenter_kpi",
  "/admin/analytics": "analytics_advanced",
  "/ceo-dashboard": "ceo_dashboard",
  "/azienda": "company_finance",
  "/azienda/costi": "company_finance",
  "/azienda/budget": "company_finance",
  "/azienda/report": "company_finance",
  "/install": "pwa_install",
};

export function useFeatureFlags() {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ["feature-flags", currentBrand?.id],
    queryFn: async () => {
      if (!currentBrand?.id) return [];
      const { data, error } = await supabase
        .from("feature_flags")
        .select("*")
        .eq("brand_id", currentBrand.id);
      if (error) throw error;
      return (data || []) as FeatureFlag[];
    },
    enabled: !!currentBrand?.id,
    staleTime: 5 * 60_000,
  });
}

export function useModuleStatus(moduleKey: string): ModuleStatus {
  const { data: flags } = useFeatureFlags();
  const flag = flags?.find((f) => f.module_key === moduleKey);
  return flag?.status ?? "active";
}

export function useModuleFlag(moduleKey: string): FeatureFlag | null {
  const { data: flags } = useFeatureFlags();
  return flags?.find((f) => f.module_key === moduleKey) ?? null;
}

export function useIsModuleAccessible(moduleKey: string): boolean {
  const status = useModuleStatus(moduleKey);
  const { data: userAccess } = useCurrentUserModuleAccess();
  const userOverride = userAccess?.find((a) => a.module_key === moduleKey);
  // If user has an explicit override, respect it; otherwise fall back to brand-level status
  if (userOverride !== undefined) return userOverride.is_enabled;
  return status !== "frozen" && status !== "sunset";
}

/** Returns the module key for a given route path */
export function getModuleKeyForRoute(path: string): string | null {
  return ROUTE_MODULE_MAP[path] ?? null;
}

/** Track module usage (fire-and-forget) */
export function useTrackModuleUsage() {
  const { currentBrand } = useBrand();
  const { user } = useAuth();
  const trackedRef = useRef<Set<string>>(new Set());

  const track = useCallback(
    (moduleKey: string, eventType: string = "page_view") => {
      if (!currentBrand?.id || !user?.id) return;
      // Debounce: don't track same module twice in same render cycle
      const key = `${moduleKey}_${eventType}`;
      if (trackedRef.current.has(key)) return;
      trackedRef.current.add(key);

      // Fire and forget
      supabase.from("module_usage_events")
        .insert({
          brand_id: currentBrand.id,
          module_key: moduleKey,
          user_id: user.id,
          event_type: eventType,
        })
        .then(() => {
          // Clean up after 30s to allow re-tracking
          setTimeout(() => trackedRef.current.delete(key), 30_000);
        });
    },
    [currentBrand?.id, user?.id]
  );

  return track;
}

/** Auto-track page view for the current route */
export function useAutoTrackModule(moduleKey: string | null) {
  const track = useTrackModuleUsage();

  useEffect(() => {
    if (moduleKey) {
      track(moduleKey);
    }
  }, [moduleKey, track]);
}

export function useModuleAdoptionStats(days: number = 30) {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ["module-adoption-stats", currentBrand?.id, days],
    queryFn: async () => {
      if (!currentBrand?.id) return [];
      const { data, error } = await supabase.rpc("get_module_adoption_stats", {
        p_brand_id: currentBrand.id,
        p_days: days,
      });
      if (error) throw error;
      return (data as unknown as ModuleAdoptionStat[]) || [];
    },
    enabled: !!currentBrand?.id,
    staleTime: 5 * 60_000,
  });
}

export function useUpdateFeatureFlag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { id: string; status: ModuleStatus; frozen_message?: string }) => {
      const { error } = await supabase
        .from("feature_flags")
        .update({
          status: params.status,
          frozen_message: params.frozen_message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feature-flags"] });
    },
  });
}
