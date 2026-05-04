import { QueryClient } from "@tanstack/react-query";
import { localStoragePersister } from "@/lib/queryPersister";

/**
 * Singleton QueryClient + persister wired together.
 *
 * Exposed as a module so other parts of the app (notably AuthContext on
 * signOut) can fully wipe the in-memory cache AND the on-disk persister,
 * which would otherwise survive across logins/sessions on the same device
 * (GDPR data minimization).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      gcTime: 1000 * 60 * 15,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export const persistOptions = {
  persister: localStoragePersister,
  maxAge: 1000 * 60 * 60 * 4, // 4 hours
  buster: "v1",
} as const;

/**
 * Best-effort teardown of every query-cache surface. Call this on signOut
 * and on detected role/identity change. Safe to call multiple times.
 *
 *  1. `queryClient.cancelQueries()` — abort in-flight fetches that would
 *     otherwise repopulate the cache after `clear()`.
 *  2. `queryClient.clear()` — drop the in-memory cache.
 *  3. `localStoragePersister.removeClient()` — drop the on-disk cache so
 *     the next user on the same device cannot restore it.
 */
export async function clearAllQueryCaches(): Promise<void> {
  try {
    await queryClient.cancelQueries();
  } catch {
    /* no-op */
  }
  try {
    queryClient.clear();
  } catch {
    /* no-op */
  }
  try {
    await localStoragePersister.removeClient();
  } catch {
    /* no-op */
  }
}
