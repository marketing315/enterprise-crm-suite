import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import { toast } from "sonner";

export interface BrandCampaignOption {
  id: string;
  name: string;
  channel_id: string | null;
  channel_name: string | null;
  channel_type: string | null;
  status: string;
  start_date: string;
  end_date: string | null;
  planned_budget: number | null;
  external_id: string | null;
  leads_count: number;
}

/**
 * List campaigns for the current brand for attribution selectors.
 * Includes channel info + lead count for richer UX.
 */
export function useBrandCampaigns() {
  const { currentBrand } = useBrand();
  const brandId = currentBrand?.id;

  return useQuery({
    queryKey: ["brand-campaigns-rich", brandId],
    queryFn: async (): Promise<BrandCampaignOption[]> => {
      if (!brandId) return [];
      const { data, error } = await supabase
        .from("marketing_campaigns")
        .select(
          `id, name, channel_id, status, start_date, end_date, planned_budget, external_id,
           marketing_channels(name, type),
           lead_events(count)`
        )
        .eq("brand_id", brandId)
        .order("status", { ascending: true })
        .order("start_date", { ascending: false })
        .limit(500);
      if (error) throw error;
      return ((data ?? []) as any[]).map((c) => ({
        id: c.id,
        name: c.name,
        channel_id: c.channel_id ?? null,
        channel_name: c.marketing_channels?.name ?? null,
        channel_type: c.marketing_channels?.type ?? null,
        status: c.status,
        start_date: c.start_date,
        end_date: c.end_date ?? null,
        planned_budget: c.planned_budget ?? null,
        external_id: c.external_id ?? null,
        leads_count: Array.isArray(c.lead_events) ? (c.lead_events[0]?.count ?? 0) : 0,
      }));
    },
    enabled: !!brandId,
    staleTime: 60_000,
  });
}

/**
 * Manually attribute (or clear) a marketing campaign on a lead_event.
 */
export function useSetLeadEventCampaign() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: { eventId: string; campaignId: string | null }) => {
      const { error } = await supabase.rpc("set_lead_event_campaign", {
        p_event_id: params.eventId,
        p_campaign_id: params.campaignId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead-events"] });
      qc.invalidateQueries({ queryKey: ["contact"] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
      qc.invalidateQueries({ queryKey: ["marketing-leads-by-campaign"] });
      qc.invalidateQueries({ queryKey: ["ad-platform-stats-summary"] });
      qc.invalidateQueries({ queryKey: ["brand-campaigns-rich"] });
      toast.success("Attribuzione aggiornata");
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Errore";
      toast.error(`Impossibile aggiornare l'attribuzione: ${msg}`);
    },
  });
}
