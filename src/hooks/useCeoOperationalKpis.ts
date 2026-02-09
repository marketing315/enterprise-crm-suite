import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBrand } from '@/contexts/BrandContext';
import { useHasFinanceAccess } from './useCompanyFinance';

export interface DealsByStage {
  stage_name: string;
  stage_order: number;
  count: number;
  total_value: number;
}

export interface CeoOperationalData {
  total_contacts: number;
  new_contacts_period: number;
  open_tickets: number;
  tickets_created: number;
  appointments_period: number;
  deals_by_stage: DealsByStage[];
  total_open_deals: number;
  total_open_value: number;
  won_deals_period: number;
  won_deals_revenue: number;
}

export function useCeoOperationalKpis(from: Date, to: Date) {
  const { currentBrand, isAllBrandsSelected, allBrandIds } = useBrand();
  const hasAccess = useHasFinanceAccess();

  const brandId = currentBrand?.id;

  return useQuery({
    queryKey: ['ceo-operational-kpis', brandId, isAllBrandsSelected, from.toISOString(), to.toISOString()],
    queryFn: async () => {
      if (!brandId) throw new Error('No brand selected');

      const params: Record<string, unknown> = {
        p_brand_id: brandId,
        p_from: from.toISOString().split('T')[0],
        p_to: to.toISOString().split('T')[0],
      };

      if (isAllBrandsSelected && allBrandIds.length > 0) {
        params.p_brand_ids = allBrandIds;
      }

      const { data, error } = await supabase.rpc('get_ceo_operational_kpis', params as any);

      if (error) throw error;
      return data as unknown as CeoOperationalData;
    },
    enabled: !!brandId && hasAccess,
    staleTime: 2 * 60_000,
    refetchInterval: 5 * 60_000,
  });
}
