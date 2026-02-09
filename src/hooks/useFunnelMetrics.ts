import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import { useAuth } from "@/contexts/AuthContext";

export interface FunnelMetrics {
  impressions: number;
  clicks: number;
  leads: number;
  called_contacts: number;
  answered_contacts: number;
  appointments: number;
  sales: number;
  sales_revenue: number;
  lost_threshold_days: number;
  conversions: {
    impression_to_click: number;
    click_to_lead: number;
    lead_to_called: number;
    called_to_answered: number;
    answered_to_appointment: number;
    appointment_to_sale: number;
    overall: number;
  };
}

export interface FunnelLosses {
  total_lost: number;
  by_stage: { stage: string; count: number }[];
  by_reason: { reason: string; count: number }[];
}

export interface FunnelBreakdown {
  by_campaign: {
    campaign_id: string;
    campaign_name: string;
    impressions: number;
    clicks: number;
    leads: number;
    appointments: number;
    sales: number;
    revenue: number;
  }[];
}

interface UseFunnelParams {
  from?: Date;
  to?: Date;
}

export function useFunnelMetrics({ from, to }: UseFunnelParams = {}) {
  const { currentBrand } = useBrand();
  const { user, userRoles } = useAuth();

  const fromDate = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const toDate = to || new Date();

  // Determine the primary role for filtering
  const primaryRole = userRoles.length > 0 ? userRoles[0].role : null;

  const metricsQuery = useQuery({
    queryKey: ["funnel", "metrics", currentBrand?.id, user?.id, fromDate.toISOString(), toDate.toISOString()],
    queryFn: async (): Promise<FunnelMetrics> => {
      if (!currentBrand?.id) throw new Error("No brand selected");

      const { data, error } = await (supabase as any).rpc("get_funnel_metrics", {
        p_brand_id: currentBrand.id,
        p_user_id: user?.id || null,
        p_role: primaryRole,
        p_from: fromDate.toISOString(),
        p_to: toDate.toISOString(),
      });

      if (error) throw error;
      return data as FunnelMetrics;
    },
    enabled: !!currentBrand?.id,
    staleTime: 2 * 60_000,
    refetchInterval: 5 * 60_000,
  });

  const lossesQuery = useQuery({
    queryKey: ["funnel", "losses", currentBrand?.id, user?.id, fromDate.toISOString(), toDate.toISOString()],
    queryFn: async (): Promise<FunnelLosses> => {
      if (!currentBrand?.id) throw new Error("No brand selected");

      const { data, error } = await (supabase as any).rpc("get_funnel_losses", {
        p_brand_id: currentBrand.id,
        p_user_id: user?.id || null,
        p_role: primaryRole,
        p_from: fromDate.toISOString(),
        p_to: toDate.toISOString(),
      });

      if (error) throw error;
      return data as FunnelLosses;
    },
    enabled: !!currentBrand?.id,
    staleTime: 2 * 60_000,
    refetchInterval: 5 * 60_000,
  });

  const breakdownQuery = useQuery({
    queryKey: ["funnel", "breakdown", currentBrand?.id, user?.id, fromDate.toISOString(), toDate.toISOString()],
    queryFn: async (): Promise<FunnelBreakdown> => {
      if (!currentBrand?.id) throw new Error("No brand selected");

      const { data, error } = await (supabase as any).rpc("get_funnel_breakdown", {
        p_brand_id: currentBrand.id,
        p_user_id: user?.id || null,
        p_role: primaryRole,
        p_from: fromDate.toISOString(),
        p_to: toDate.toISOString(),
      });

      if (error) throw error;
      return data as FunnelBreakdown;
    },
    enabled: !!currentBrand?.id,
    staleTime: 2 * 60_000,
    refetchInterval: 5 * 60_000,
  });

  return {
    metrics: metricsQuery.data,
    losses: lossesQuery.data,
    breakdown: breakdownQuery.data,
    isLoading: metricsQuery.isLoading || lossesQuery.isLoading || breakdownQuery.isLoading,
    error: metricsQuery.error || lossesQuery.error || breakdownQuery.error,
    refetch: () => {
      metricsQuery.refetch();
      lossesQuery.refetch();
      breakdownQuery.refetch();
    },
  };
}
