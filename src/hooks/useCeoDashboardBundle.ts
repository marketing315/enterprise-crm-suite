import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBrand } from '@/contexts/BrandContext';
import { useHasFinanceAccess, COMPANY_BRAND_ID } from './useCompanyFinance';
import type { CeoKpi } from '@/types/company';
import type { CeoOperationalData } from './useCeoOperationalKpis';

export interface CeoDashboardBundle {
  financial: CeoKpi;
  operational: CeoOperationalData;
}

/**
 * Single round-trip fetch for the CEO dashboard core KPIs.
 * Replaces useCeoDashboard + useCeoOperationalKpis on the main view.
 */
export function useCeoDashboardBundle(from: Date, to: Date) {
  const { currentBrand, isAllBrandsSelected, allBrandIds } = useBrand();
  const hasAccess = useHasFinanceAccess();

  const brandId = isAllBrandsSelected ? COMPANY_BRAND_ID : currentBrand?.id;

  return useQuery({
    queryKey: ['ceo-dashboard-bundle', brandId, isAllBrandsSelected, from.toISOString(), to.toISOString()],
    queryFn: async () => {
      if (!brandId) throw new Error('No brand selected');

      const params: {
        p_brand_id: string;
        p_from: string;
        p_to: string;
        p_brand_ids?: string[];
      } = {
        p_brand_id: brandId,
        p_from: from.toISOString().split('T')[0],
        p_to: to.toISOString().split('T')[0],
      };

      if (isAllBrandsSelected && allBrandIds.length > 0) {
        params.p_brand_ids = allBrandIds;
      }

      const { data, error } = await supabase.rpc('get_ceo_dashboard_bundle', params);
      if (error) throw error;
      return data as unknown as CeoDashboardBundle;
    },
    enabled: !!brandId && hasAccess,
    staleTime: 2 * 60_000,
    refetchInterval: 5 * 60_000,
  });
}
