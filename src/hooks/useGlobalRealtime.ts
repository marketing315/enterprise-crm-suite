import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBrand } from '@/contexts/BrandContext';

/**
 * Table-to-queryKey mapping for cache invalidation.
 * When a realtime event arrives for a table, all listed query keys are invalidated.
 *
 * `exact: true` entries invalidate only the precise key (faster).
 * Without `exact`, all queries whose key *starts with* the given array are invalidated.
 */
interface InvalidationEntry {
  key: string[];
  exact?: boolean;
}

const TABLE_QUERY_MAP: Record<string, InvalidationEntry[]> = {
  deals: [
    { key: ['deals'] },
    { key: ['deal-score'] },
    { key: ['deal-score-history'] },
    { key: ['brand-deal-scores'] },
    { key: ['pipeline-stages'], exact: true },
    { key: ['revenue-forecast'] },
    { key: ['forecast-history'] },
    { key: ['dashboard-open-deals'] },
    { key: ['dashboard-trend'] },
  ],
  deal_stage_history: [{ key: ['deals'] }],
  lead_events: [
    { key: ['lead-events'] },
    { key: ['contact'] },
    { key: ['dashboard-leads-today'] },
    { key: ['dashboard-leads-week'] },
    { key: ['dashboard-trend'] },
  ],
  appointments: [
    { key: ['appointments'] },
    { key: ['dashboard-appointments-today'] },
  ],
  contacts: [
    { key: ['contacts'] },
    { key: ['contact-search'] },
    { key: ['dashboard-total-contacts'] },
  ],
  tickets: [
    { key: ['dashboard-open-tickets'] },
    { key: ['dashboard-sla-breached'] },
    { key: ['dashboard-trend'] },
  ],
  sales_orders: [{ key: ['sales-orders'] }, { key: ['sales-kpis'] }],
  sales_order_items: [{ key: ['sales-orders'] }, { key: ['sales-order-items'] }],
  payments: [{ key: ['payments'] }],
  products: [{ key: ['products'], exact: true }],
  marketing_campaigns: [{ key: ['marketing-campaigns'], exact: true }],
  marketing_costs: [{ key: ['marketing-costs'] }, { key: ['marketing-kpis'] }],
  tags: [
    { key: ['tags'], exact: true },
    { key: ['deals'] },
    { key: ['contacts'] },
    { key: ['contact-search'] },
  ],
  tag_assignments: [
    { key: ['tags'], exact: true },
    { key: ['deals'] },
    { key: ['contacts'] },
    { key: ['contact-search'] },
  ],
  pipeline_stages: [{ key: ['pipeline-stages'], exact: true }],
  admin_todos: [{ key: ['admin-todos'], exact: true }],
  action_suggestions: [{ key: ['action-suggestions'], exact: true }],
};

/** Tables that do NOT have a brand_id column – subscribe without filter */
const TABLES_WITHOUT_BRAND_ID = new Set(['deal_stage_history', 'sales_order_items']);

/** Group tables into logical channels to keep subscriptions organized */
const CHANNEL_GROUPS: Record<string, string[]> = {
  'global-pipeline-rt': ['deals', 'deal_stage_history', 'pipeline_stages'],
  'global-leads-rt': ['lead_events', 'appointments', 'contacts'],
  'global-sales-rt': ['sales_orders', 'sales_order_items', 'payments', 'products'],
  'global-marketing-rt': ['marketing_campaigns', 'marketing_costs'],
  'global-tags-rt': ['tags', 'tag_assignments'],
  'global-admin-rt': ['admin_todos', 'action_suggestions'],
  'global-tickets-rt': ['tickets'],
};

/**
 * Centralized realtime hook that subscribes to ALL remaining tables
 * and invalidates the corresponding React-Query caches.
 *
 * Uses granular invalidation: `exact: true` entries prevent
 * unnecessary cascade invalidations across unrelated queries.
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
          const noBrandFilter = TABLES_WITHOUT_BRAND_ID.has(table);
          const opts = (isAllBrandsSelected || noBrandFilter)
            ? { event: '*' as const, schema: 'public' as const, table }
            : { event: '*' as const, schema: 'public' as const, table, filter: `brand_id=eq.${brandId}` };

          channel.on('postgres_changes', opts, () => {
            const entries = TABLE_QUERY_MAP[table];
            if (entries) {
              entries.forEach((entry) => {
                queryClient.invalidateQueries({
                  queryKey: entry.key,
                  exact: entry.exact ?? false,
                });
              });
            }
          });
        });

        // H09 FIX: Handle subscribe errors
        channel.subscribe((status, err) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn(`[Realtime] Channel ${channelName} error:`, status, err?.message);
          }
        });
        return channel;
      },
    );

    return () => {
      channels.forEach((ch) => supabase.removeChannel(ch));
    };
  }, [brandId, isAllBrandsSelected, queryClient]);
}
