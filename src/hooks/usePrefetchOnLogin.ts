import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBrand } from '@/contexts/BrandContext';
import { useAuth } from '@/contexts/AuthContext';
import { startOfDay, endOfDay } from 'date-fns';

/**
 * Prefetches the most-visited data (dashboard KPIs, pipeline stages, contacts)
 * once after login + brand selection. Runs only once per session.
 */
export function usePrefetchOnLogin() {
  const queryClient = useQueryClient();
  const { currentBrand, isAllBrandsSelected, allBrandIds } = useBrand();
  const { user } = useAuth();
  const hasPrefetched = useRef(false);

  useEffect(() => {
    if (!user || !currentBrand || hasPrefetched.current) return;
    hasPrefetched.current = true;

    const brandIds = isAllBrandsSelected ? allBrandIds : [currentBrand.id];
    if (brandIds.length === 0) return;

    const brandKey = isAllBrandsSelected ? 'all' : currentBrand.id;
    const today = new Date();

    // Fire-and-forget prefetches in parallel
    // Dashboard KPIs
    queryClient.prefetchQuery({
      queryKey: ['dashboard-leads-today', brandKey],
      queryFn: async () => {
        let q = supabase
          .from('lead_events')
          .select('contact_id')
          .gte('received_at', startOfDay(today).toISOString())
          .lte('received_at', endOfDay(today).toISOString())
          .not('contact_id', 'is', null);
        if (brandIds.length === 1) q = q.eq('brand_id', brandIds[0]);
        else q = q.in('brand_id', brandIds);
        const { data } = await q;
        return new Set(data?.map(e => e.contact_id) || []).size;
      },
      staleTime: 30_000,
    });

    queryClient.prefetchQuery({
      queryKey: ['dashboard-open-deals', brandKey],
      queryFn: async () => {
        let q = supabase.from('deals').select('*', { count: 'exact', head: true }).eq('status', 'open');
        if (brandIds.length === 1) q = q.eq('brand_id', brandIds[0]);
        else q = q.in('brand_id', brandIds);
        const { count } = await q;
        return count || 0;
      },
      staleTime: 30_000,
    });

    queryClient.prefetchQuery({
      queryKey: ['dashboard-open-tickets', brandKey],
      queryFn: async () => {
        let q = supabase.from('tickets').select('*', { count: 'exact', head: true }).in('status', ['open', 'in_progress', 'reopened']);
        if (brandIds.length === 1) q = q.eq('brand_id', brandIds[0]);
        else q = q.in('brand_id', brandIds);
        const { count } = await q;
        return count || 0;
      },
      staleTime: 30_000,
    });

    // Pipeline stages (global, no brand filter)
    queryClient.prefetchQuery({
      queryKey: ['pipeline-stages'],
      queryFn: async () => {
        const { data } = await supabase.from('pipeline_stages').select('*').eq('is_active', true).order('order_index');
        return data || [];
      },
      staleTime: 300_000,
    });

    // Contacts (first page)
    queryClient.prefetchQuery({
      queryKey: ['contacts', brandKey, undefined],
      queryFn: async () => {
        let q = supabase.from('contacts').select('*, contact_phones (*)').order('created_at', { ascending: false }).limit(100);
        if (isAllBrandsSelected) q = q.in('brand_id', allBrandIds);
        else q = q.eq('brand_id', currentBrand.id);
        const { data } = await q;
        return data || [];
      },
      staleTime: 60_000,
    });
  }, [user, currentBrand, isAllBrandsSelected, allBrandIds, queryClient]);
}
