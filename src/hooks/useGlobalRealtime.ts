import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBrand } from '@/contexts/BrandContext';

/**
 * Table-to-queryKey mapping for cache invalidation.
 * When a realtime event arrives for a table, all listed query keys are invalidated.
 */
const TABLE_QUERY_MAP: Record<string, string[][]> = {
  deals: [['deals'], ['deal-scoring'], ['pipeline-stages'], ['forecast']],
  deal_stage_history: [['deals']],
  lead_events: [['lead-events'], ['contact-lead-events']],
  appointments: [['appointments']],
  sales_orders: [['sales-orders'], ['sales-kpis']],
  sales_order_items: [['sales-orders'], ['sales-order-items']],
  payments: [['payments']],
  products: [['products']],
  marketing_campaigns: [['marketing-campaigns']],
  marketing_costs: [['marketing-costs'], ['marketing-kpis']],
  tags: [['tags'], ['deals'], ['contacts'], ['contact-search']],
  tag_assignments: [['tags'], ['deals'], ['contacts'], ['contact-search']],
  pipeline_stages: [['pipeline-stages']],
  admin_todos: [['admin-todos']],
  action_suggestions: [['action-suggestions']],
};

/** Group tables into logical channels to keep subscriptions organized */
const CHANNEL_GROUPS: Record<string, string[]> = {
  'global-pipeline-rt': ['deals', 'deal_stage_history', 'pipeline_stages'],
  'global-leads-rt': ['lead_events', 'appointments'],
  'global-sales-rt': ['sales_orders', 'sales_order_items', 'payments', 'products'],
  'global-marketing-rt': ['marketing_campaigns', 'marketing_costs'],
  'global-tags-rt': ['tags', 'tag_assignments'],
  'global-admin-rt': ['admin_todos', 'action_suggestions'],
};

/**
 * Centralized realtime hook that subscribes to ALL remaining tables
 * and invalidates the corresponding React-Query caches.
 *
 * Call once in MainLayout so it's active on every page.
 */
export function useGlobalRealtime() {
  const queryClient = useQueryClient();
  const { currentBrand, isAllBrandsSelected } = useBrand();
  const brandId = currentBrand?.id ?? null;

  useEffect(() => {
    if (!brandId) return;

    const channels = Object.entries(CHANNEL_GROUPS).map(
      ([channelName, tables]) => {
        const channel = supabase.channel(channelName);

        tables.forEach((table) => {
          // Build filter: skip brand_id filter in "Azienda Intera" mode
          const filterOpts: Parameters<typeof channel.on>[2] =
            isAllBrandsSelected
              ? { event: '*', schema: 'public', table }
              : { event: '*', schema: 'public', table, filter: `brand_id=eq.${brandId}` };

          channel.on('postgres_changes', filterOpts, () => {
            const keys = TABLE_QUERY_MAP[table];
            if (keys) {
              keys.forEach((queryKey) =>
                queryClient.invalidateQueries({ queryKey }),
              );
            }
          });
        });

        channel.subscribe();
        return channel;
      },
    );

    return () => {
      channels.forEach((ch) => supabase.removeChannel(ch));
    };
  }, [brandId, isAllBrandsSelected, queryClient]);
}
