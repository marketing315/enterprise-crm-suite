import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client';
import { PERSISTABLE_QUERY_KEYS } from './queryCache';

const STORAGE_KEY = 'crm_query_cache';
const MAX_AGE_MS = 1000 * 60 * 60 * 4; // 4 hours

/**
 * A custom localStorage persister that only saves whitelisted query keys
 * (stable, non-sensitive data like pipeline stages, tags, products).
 *
 * This gives instant UI on page reload without exposing user-specific data.
 */
export const localStoragePersister: Persister = {
  persistClient: async (client: PersistedClient) => {
    try {
      // Filter: only persist whitelisted queries
      const filtered: PersistedClient = {
        ...client,
        clientState: {
          ...client.clientState,
          queries: client.clientState.queries.filter((q) =>
            PERSISTABLE_QUERY_KEYS.some((key) =>
              q.queryKey.length > 0 && q.queryKey[0] === key
            )
          ),
          mutations: [], // never persist mutations
        },
      };

      const serialized = JSON.stringify(filtered);
      // Only store if < 2 MB to avoid quota issues
      if (serialized.length < 2 * 1024 * 1024) {
        localStorage.setItem(STORAGE_KEY, serialized);
      }
    } catch {
      // Silently ignore storage errors (quota, private browsing, etc.)
    }
  },

  restoreClient: async (): Promise<PersistedClient | undefined> => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return undefined;

      const client: PersistedClient = JSON.parse(raw);

      // Expire the whole cache if it's too old
      if (Date.now() - client.timestamp > MAX_AGE_MS) {
        localStorage.removeItem(STORAGE_KEY);
        return undefined;
      }

      return client;
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      return undefined;
    }
  },

  removeClient: async () => {
    localStorage.removeItem(STORAGE_KEY);
  },
};
