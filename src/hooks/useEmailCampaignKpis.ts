import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";

export interface EmailCampaignKpi {
  template_name: string;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  unsubscribed: number;
  failed: number;
  open_rate: number;
  click_rate: number;
}

export function useEmailCampaignKpis(fromIso: string, toIso: string) {
  const { currentBrand } = useBrand();
  const brandId = currentBrand?.id;

  return useQuery({
    queryKey: ["email-campaign-kpis", brandId ?? "", fromIso, toIso],
    queryFn: async (): Promise<EmailCampaignKpi[]> => {
      if (!brandId) return [];
      const { data, error } = await supabase.rpc("get_email_campaign_kpis" as never, {
        p_brand_id: brandId,
        p_from: fromIso,
        p_to: toIso,
      } as never);
      if (error) throw error;
      return ((data as unknown) as EmailCampaignKpi[]) ?? [];
    },
    enabled: !!brandId && !!fromIso && !!toIso,
    staleTime: 60_000,
  });
}
