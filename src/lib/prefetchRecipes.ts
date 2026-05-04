import type { QueryClient } from '@tanstack/react-query';
import { startOfDay, endOfDay } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

export interface PrefetchContext {
  brandIds: string[];
  isAllBrandsSelected: boolean;
  brandKey: string; // 'all' or single brand id
}

type Recipe = (qc: QueryClient, ctx: PrefetchContext) => void;

/** Dashboard core: today's KPIs + pipeline stages. */
export const prefetchDashboard: Recipe = (qc, { brandIds, isAllBrandsSelected, brandKey }) => {
  const today = new Date();

  qc.prefetchQuery({
    queryKey: ['dashboard-leads-today', brandKey],
    queryFn: async () => {
      const { data } = await supabase.rpc('count_new_leads_in_range', {
        p_brand_ids: brandIds,
        p_from: startOfDay(today).toISOString(),
        p_to: endOfDay(today).toISOString(),
      });
      return (data as number) ?? 0;
    },
    staleTime: 30_000,
  });

  qc.prefetchQuery({
    queryKey: ['dashboard-open-deals', brandKey],
    queryFn: async () => {
      let q = supabase.from('deals').select('*', { count: 'exact', head: true }).eq('status', 'open');
      q = brandIds.length === 1 ? q.eq('brand_id', brandIds[0]) : q.in('brand_id', brandIds);
      const { count } = await q;
      return count || 0;
    },
    staleTime: 30_000,
  });

  qc.prefetchQuery({
    queryKey: ['dashboard-open-tickets', brandKey],
    queryFn: async () => {
      let q = supabase
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .in('status', ['open', 'in_progress', 'reopened']);
      q = brandIds.length === 1 ? q.eq('brand_id', brandIds[0]) : q.in('brand_id', brandIds);
      const { count } = await q;
      return count || 0;
    },
    staleTime: 30_000,
  });

  qc.prefetchQuery({
    queryKey: ['pipeline-stages'],
    queryFn: async () => {
      const { data } = await supabase
        .from('pipeline_stages')
        .select('*')
        .eq('is_active', true)
        .order('order_index');
      return data || [];
    },
    staleTime: 300_000,
  });
};

/** Contacts list (first page). */
export const prefetchContacts: Recipe = (qc, { brandIds, isAllBrandsSelected, brandKey }) => {
  qc.prefetchQuery({
    queryKey: ['contacts', brandKey, undefined],
    queryFn: async () => {
      let q = supabase
        .from('contacts')
        .select('*, contact_phones (*)')
        .order('created_at', { ascending: false })
        .limit(100);
      q = isAllBrandsSelected ? q.in('brand_id', brandIds) : q.eq('brand_id', brandIds[0]);
      const { data } = await q;
      return data || [];
    },
    staleTime: 60_000,
  });
};

/** Pipeline page: stages (cheap, shared). */
export const prefetchPipeline: Recipe = (qc) => {
  qc.prefetchQuery({
    queryKey: ['pipeline-stages'],
    queryFn: async () => {
      const { data } = await supabase
        .from('pipeline_stages')
        .select('*')
        .eq('is_active', true)
        .order('order_index');
      return data || [];
    },
    staleTime: 300_000,
  });
};

/** Map of route prefix → recipes to run. */
const ROUTE_RECIPES: Array<{ test: (path: string) => boolean; recipes: Recipe[] }> = [
  { test: (p) => p === '/' || p === '/index' || p.startsWith('/dashboard'), recipes: [prefetchDashboard, prefetchContacts] },
  { test: (p) => p.startsWith('/contacts'), recipes: [prefetchContacts] },
  { test: (p) => p.startsWith('/pipeline'), recipes: [prefetchPipeline] },
];

/** Fire-and-forget prefetch for a target route. No-op if no recipe matches. */
export function prefetchForRoute(path: string, qc: QueryClient, ctx: PrefetchContext) {
  if (!ctx.brandIds || ctx.brandIds.length === 0) return;
  for (const entry of ROUTE_RECIPES) {
    if (entry.test(path)) {
      entry.recipes.forEach((r) => r(qc, ctx));
      return;
    }
  }
}
