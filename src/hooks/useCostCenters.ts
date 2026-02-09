import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBrand } from '@/contexts/BrandContext';
import { COMPANY_BRAND_ID } from './useCompanyFinance';
import type { CostCenter } from '@/types/company';
import { toast } from 'sonner';

export function useCostCenters() {
  const { currentBrand, isAllBrandsSelected } = useBrand();
  const brandId = isAllBrandsSelected ? COMPANY_BRAND_ID : currentBrand?.id;
  
  return useQuery({
    queryKey: ['cost-centers', brandId],
    queryFn: async () => {
      if (!brandId) throw new Error('No brand selected');
      
      const { data, error } = await supabase
        .from('cost_centers')
        .select('*')
        .eq('brand_id', brandId)
        .eq('is_active', true)
        .order('name');
      
      if (error) throw error;
      return data as CostCenter[];
    },
    enabled: !!brandId,
  });
}

export function useCreateCostCenter() {
  const queryClient = useQueryClient();
  const { currentBrand, isAllBrandsSelected } = useBrand();
  const brandId = isAllBrandsSelected ? COMPANY_BRAND_ID : currentBrand?.id;
  
  return useMutation({
    mutationFn: async (data: { name: string; code?: string }) => {
      if (!brandId) throw new Error('No brand selected');
      
      const { data: center, error } = await supabase
        .from('cost_centers')
        .insert({
          brand_id: brandId,
          name: data.name,
          code: data.code || null,
        })
        .select()
        .single();
      
      if (error) throw error;
      return center;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cost-centers'] });
      toast.success('Centro di costo creato');
    },
    onError: (error: Error) => {
      toast.error(`Errore: ${error.message}`);
    },
  });
}

export function useUpdateCostCenter() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { name?: string; code?: string; is_active?: boolean } }) => {
      const { data: center, error } = await supabase
        .from('cost_centers')
        .update(data)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return center;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cost-centers'] });
      toast.success('Centro di costo aggiornato');
    },
    onError: (error: Error) => {
      toast.error(`Errore: ${error.message}`);
    },
  });
}

export function useDeleteCostCenter() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      // Soft delete by setting is_active to false
      const { error } = await supabase
        .from('cost_centers')
        .update({ is_active: false })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cost-centers'] });
      toast.success('Centro di costo eliminato');
    },
    onError: (error: Error) => {
      toast.error(`Errore: ${error.message}`);
    },
  });
}
