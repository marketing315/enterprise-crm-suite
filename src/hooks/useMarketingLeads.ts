import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrandFilter } from "@/hooks/useBrandFilter";

export interface MarketingLeadByCampaign {
  campaign_id: string;
  campaign_name: string;
  channel_name: string;
  total_leads: number;
  manual_leads: number;
  meta_leads: number;
  webhook_leads: number;
  meta_matched: number;
  meta_unmatched: number;
}

export function useMarketingLeadsByCampaign(fromDate: string, toDate: string) {
  const { getBrandIds, getQueryKeyBrand, isQueryEnabled } = useBrandFilter();

  return useQuery({
    queryKey: ["marketing-leads-by-campaign", getQueryKeyBrand(), fromDate, toDate],
    queryFn: async (): Promise<MarketingLeadByCampaign[]> => {
      const brandIds = getBrandIds();
      if (!brandIds.length) return [];

      const { data, error } = await supabase.rpc("get_marketing_leads_by_campaign", {
        p_brand_ids: brandIds,
        p_from_date: fromDate,
        p_to_date: toDate,
      });

      if (error) throw error;
      return (data || []) as MarketingLeadByCampaign[];
    },
    enabled: isQueryEnabled() && !!fromDate && !!toDate,
  });
}

export function useCreateMarketingLead() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      brandId: string;
      contactId: string;
      campaignId?: string;
      sourceName?: string;
      notes?: string;
    }) => {
      const { data, error } = await supabase.rpc("create_marketing_lead", {
        p_brand_id: params.brandId,
        p_contact_id: params.contactId,
        p_marketing_campaign_id: params.campaignId || null,
        p_source_name: params.sourceName || "Lead manuale marketing",
        p_notes: params.notes || null,
      });

      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marketing-leads-by-campaign"] });
      qc.invalidateQueries({ queryKey: ["lead-events"] });
    },
  });
}
