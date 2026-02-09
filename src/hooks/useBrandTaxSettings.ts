import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBrand } from '@/contexts/BrandContext';
import { useAuth } from '@/contexts/AuthContext';
import { COMPANY_BRAND_ID } from './useCompanyFinance';
import type { BrandTaxSettings } from '@/types/company';
import { toast } from 'sonner';

export function useBrandTaxSettings() {
  const { currentBrand, isAllBrandsSelected } = useBrand();
  const brandId = isAllBrandsSelected ? COMPANY_BRAND_ID : currentBrand?.id;
  
  return useQuery({
    queryKey: ['brand-tax-settings', brandId],
    queryFn: async () => {
      if (!brandId) throw new Error('No brand selected');
      
      const { data, error } = await supabase
        .from('brand_tax_settings')
        .select('*')
        .eq('brand_id', brandId)
        .maybeSingle();
      
      if (error) throw error;
      
      // Return default values if no settings exist
      if (!data) {
        return {
          id: '',
          brand_id: brandId,
          corporate_tax_rate: 24.0,
          regional_tax_rate: 3.9,
          vat_rate_default: 22.0,
          fiscal_year_start: 1,
          notes: null,
          updated_by: null,
          updated_at: new Date().toISOString(),
        } as BrandTaxSettings;
      }
      
      return data as BrandTaxSettings;
    },
    enabled: !!brandId,
  });
}

export function useUpsertBrandTaxSettings() {
  const queryClient = useQueryClient();
  const { currentBrand, isAllBrandsSelected } = useBrand();
  const { user } = useAuth();
  const brandId = isAllBrandsSelected ? COMPANY_BRAND_ID : currentBrand?.id;
  
  return useMutation({
    mutationFn: async (data: Partial<Omit<BrandTaxSettings, 'id' | 'brand_id' | 'updated_at' | 'updated_by'>>) => {
      if (!brandId || !user) throw new Error('Missing required data');
      
      const { data: settings, error } = await supabase
        .from('brand_tax_settings')
        .upsert({
          brand_id: brandId,
          corporate_tax_rate: data.corporate_tax_rate ?? 24.0,
          regional_tax_rate: data.regional_tax_rate ?? 3.9,
          vat_rate_default: data.vat_rate_default ?? 22.0,
          fiscal_year_start: data.fiscal_year_start ?? 1,
          notes: data.notes ?? null,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'brand_id',
        })
        .select()
        .single();
      
      if (error) throw error;
      return settings;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brand-tax-settings'] });
      queryClient.invalidateQueries({ queryKey: ['ceo-dashboard-kpis'] });
      toast.success('Impostazioni fiscali salvate');
    },
    onError: (error: Error) => {
      toast.error(`Errore: ${error.message}`);
    },
  });
}
