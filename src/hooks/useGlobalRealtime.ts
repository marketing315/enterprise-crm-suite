import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBrand } from '@/contexts/BrandContext';
import { useAuth } from '@/contexts/AuthContext';

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
    { key: ['lead-events-rpc'] },
    { key: ['contact-lead-events'] },
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
  const { supabaseUser, isLoading: authLoading } = useAuth();
  const brandId = currentBrand?.id ?? null;

  useEffect(() => {
    if (authLoading || !supabaseUser?.id || !brandId) return;

    let isDisposed = false;
    const retryTimers: ReturnType<typeof setTimeout>[] = [];

    function removeExistingChannel(channelName: string) {
      supabase.getChannels().forEach((existing) => {
        const topic = (existing as { topic?: string }).topic;
        if (topic === channelName || topic === `realtime:${channelName}`) {
          supabase.removeChannel(existing);
        }
      });
    }

    function createChannel(channelName: string, tables: string[]) {
      removeExistingChannel(channelName);
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

      return channel;
    }

    const activeChannels: ReturnType<typeof supabase.channel>[] = [];
    const retryCounts: Record<string, number> = {};

    function subscribeChannel(channelName: string, tables: string[]) {
      if (isDisposed) return;

      const channel = createChannel(channelName, tables);
      activeChannels.push(channel);

      channel.subscribe((status, err) => {
        if (isDisposed) return;

        if (status === 'SUBSCRIBED') {
          retryCounts[channelName] = 0;
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          const attempt = (retryCounts[channelName] ?? 0) + 1;
          retryCounts[channelName] = attempt;
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
          console.warn(`[Realtime] ${channelName} ${status}, retry #${attempt} in ${delay}ms`, err?.message);

          supabase.removeChannel(channel);
          const idx = activeChannels.indexOf(channel);
          if (idx !== -1) activeChannels.splice(idx, 1);

          const timer = setTimeout(() => {
            if (isDisposed) return;
            subscribeChannel(channelName, tables);
          }, delay);
          retryTimers.push(timer);
        }
      });
    }

    Object.entries(CHANNEL_GROUPS).forEach(([channelName, tables]) => {
      subscribeChannel(channelName, tables);
    });

    return () => {
      isDisposed = true;
      retryTimers.forEach(clearTimeout);
      activeChannels.forEach((ch) => supabase.removeChannel(ch));
    };
  }, [brandId, isAllBrandsSelected, queryClient, supabaseUser?.id, authLoading]);
}

