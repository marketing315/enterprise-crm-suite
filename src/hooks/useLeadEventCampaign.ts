import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import { toast } from "sonner";

export interface BrandCampaignOption {
  id: string;
  name: string;
  channel_id: string | null;
  status: string;
  start_date: string;
}

/**
 * List active/planned campaigns for the current brand for attribution selectors.
 */
export function useBrandCampaigns() {
  const { currentBrand } = useBrand();
  const brandId = currentBrand?.id;

  return useQuery({
    queryKey: ["brand-campaigns", brandId],
    queryFn: async (): Promise<BrandCampaignOption[]> => {
      if (!brandId) return [];
      const { data, error } = await supabase
        .from("marketing_campaigns")
        .select("id, name, channel_id, status, start_date")
        .eq("brand_id", brandId)
        .order("status", { ascending: true })
        .order("start_date", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as BrandCampaignOption[];
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
      toast.success("Attribuzione aggiornata");
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Errore";
      toast.error(`Impossibile aggiornare l'attribuzione: ${msg}`);
    },
  });
}
