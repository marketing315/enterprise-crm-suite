import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBrand } from '@/contexts/BrandContext';
import { useHasFinanceAccess, COMPANY_BRAND_ID } from './useCompanyFinance';
import type { CeoKpi } from '@/types/company';

export function useCeoDashboard(from: Date, to: Date) {
  const { currentBrand } = useBrand();
  const hasAccess = useHasFinanceAccess();
  
  // Use company brand if "Tutti i brand" is selected, otherwise use current brand
  const brandId = currentBrand?.id === '__ALL_BRANDS__' ? COMPANY_BRAND_ID : currentBrand?.id;
  
  return useQuery({
    queryKey: ['ceo-dashboard-kpis', brandId, from.toISOString(), to.toISOString()],
    queryFn: async () => {
      if (!brandId) throw new Error('No brand selected');
      
      const { data, error } = await supabase.rpc('get_ceo_dashboard_kpis', {
        p_brand_id: brandId,
        p_from: from.toISOString().split('T')[0],
        p_to: to.toISOString().split('T')[0],
      });
      
      if (error) throw error;
      return data as unknown as CeoKpi;
    },
    enabled: !!brandId && hasAccess,
    staleTime: 2 * 60_000, // 2 minutes
    refetchInterval: 5 * 60_000, // 5 minutes (heavy query)
  });
}
