import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBrand } from '@/contexts/BrandContext';
import { useAuth } from '@/contexts/AuthContext';
import { realtimeStatusStore } from './useRealtimeStatus';

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
    { key: ['tickets'] },
    { key: ['ticket'] },
    { key: ['ticket-queue-counts'] },
    { key: ['ticket-comments'] },
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
  const { supabaseUser, isLoading: authLoading, isRealtimeReady } = useAuth();
  const brandId = currentBrand?.id ?? null;

  useEffect(() => {
    if (authLoading || !isRealtimeReady || !supabaseUser?.id || !brandId) return;

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
      realtimeStatusStore.set(channelName, {
        status: (retryCounts[channelName] ?? 0) > 0 ? 'reconnecting' : 'connecting',
        retryCount: retryCounts[channelName] ?? 0,
      });

      channel.subscribe((status, err) => {
        if (isDisposed) return;

        if (status === 'SUBSCRIBED') {
          const prev = realtimeStatusStore.snapshot().get(channelName);
          const wasReconnecting =
            (retryCounts[channelName] ?? 0) > 0 ||
            prev?.status === 'reconnecting' ||
            prev?.status === 'error';

          retryCounts[channelName] = 0;
          realtimeStatusStore.set(channelName, {
            status: 'connected',
            retryCount: 0,
            lastError: undefined,
          });

          // RECOVERY: events emitted while the WS was down are NOT replayed by
          // Supabase Realtime. On reconnect, force-invalidate every query mapped
          // to the tables of this channel so the UI catches up immediately
          // (e.g. a lead arriving during a JWT refresh window).
          if (wasReconnecting) {
            tables.forEach((table) => {
              const entries = TABLE_QUERY_MAP[table];
              entries?.forEach((entry) => {
                queryClient.invalidateQueries({
                  queryKey: entry.key,
                  exact: entry.exact ?? false,
                });
              });
            });
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          const attempt = (retryCounts[channelName] ?? 0) + 1;
          retryCounts[channelName] = attempt;
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
          console.warn(`[Realtime] ${channelName} ${status}, retry #${attempt} in ${delay}ms`, err?.message);

          realtimeStatusStore.set(channelName, {
            status: attempt >= 3 ? 'error' : 'reconnecting',
            retryCount: attempt,
            lastError: err?.message ?? status,
          });

          supabase.removeChannel(channel);
          const idx = activeChannels.indexOf(channel);
          if (idx !== -1) activeChannels.splice(idx, 1);

          const timer = setTimeout(() => {
            if (isDisposed) return;
            subscribeChannel(channelName, tables);
          }, delay);
          retryTimers.push(timer);
        } else if (status === 'CLOSED') {
          realtimeStatusStore.set(channelName, {
            status: 'reconnecting',
            retryCount: retryCounts[channelName] ?? 0,
          });
        }
      });
    }

    Object.entries(CHANNEL_GROUPS).forEach(([channelName, tables]) => {
      subscribeChannel(channelName, tables);
    });

    // ---------------- Fallback polling ----------------
    // If realtime stays unhealthy >30s, invalidate mapped queries every 30s
    // to keep data fresh until reconnection succeeds.
    let fallbackInterval: ReturnType<typeof setInterval> | null = null;
    let fallbackActive = false;
    const FALLBACK_GRACE_MS = 30_000;
    const FALLBACK_INTERVAL_MS = 30_000;
    const allMappedTables = Object.keys(TABLE_QUERY_MAP);

    const evaluateFallback = () => {
      if (isDisposed) return;
      const snap = realtimeStatusStore.snapshot();
      if (snap.size === 0) return;
      const now = Date.now();
      // Healthy = at least one channel connected AND no channel has been
      // in error/reconnecting for longer than the grace period.
      let oldestUnhealthy = 0;
      let allHealthy = true;
      snap.forEach((state) => {
        if (state.status !== 'connected') {
          allHealthy = false;
          const stuckFor = now - state.lastChangeAt;
          if (stuckFor > oldestUnhealthy) oldestUnhealthy = stuckFor;
        }
      });

      const shouldFallback = !allHealthy && oldestUnhealthy >= FALLBACK_GRACE_MS;

      if (shouldFallback && !fallbackActive) {
        fallbackActive = true;
        realtimeStatusStore.recordFallbackActivation();
        console.warn(
          `[Realtime] Fallback polling activated — channels unhealthy for ${Math.round(oldestUnhealthy / 1000)}s`,
        );
        fallbackInterval = setInterval(() => {
          if (isDisposed) return;
          allMappedTables.forEach((table) => {
            const entries = TABLE_QUERY_MAP[table];
            entries?.forEach((entry) => {
              queryClient.invalidateQueries({
                queryKey: entry.key,
                exact: entry.exact ?? false,
              });
            });
          });
        }, FALLBACK_INTERVAL_MS);
      } else if (!shouldFallback && fallbackActive) {
        fallbackActive = false;
        console.info('[Realtime] Fallback polling stopped — channels healthy again');
        if (fallbackInterval) {
          clearInterval(fallbackInterval);
          fallbackInterval = null;
        }
      }
    };

    const unsubscribeStatusListener = realtimeStatusStore.subscribe(evaluateFallback);
    // Re-evaluate periodically too — handles "stuck" states that don't emit
    const watchdog = setInterval(evaluateFallback, 10_000);

    return () => {
      isDisposed = true;
      retryTimers.forEach(clearTimeout);
      activeChannels.forEach((ch) => supabase.removeChannel(ch));
      unsubscribeStatusListener();
      clearInterval(watchdog);
      if (fallbackInterval) clearInterval(fallbackInterval);
      realtimeStatusStore.reset();
    };
  }, [brandId, isAllBrandsSelected, queryClient, supabaseUser?.id, authLoading, isRealtimeReady]);
}

