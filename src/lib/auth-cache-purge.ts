/**
 * Security helper: purge browser-side caches that may hold authenticated
 * Supabase responses (REST/RPC/Auth/Storage signed URLs).
 *
 * Called on SIGNED_OUT and on TOKEN_REFRESHED / USER_UPDATED to ensure
 * the UI cannot keep serving cached authorizations after the user's
 * role/session has changed.
 *
 * Two layers:
 *  1. Service Worker Cache Storage — wipes any cache name that previously
 *     held supabase.co responses (legacy "supabase-cache" + new
 *     "supabase-public-assets"). Safe no-op if SW is not registered.
 *  2. The caller is expected to also invalidate React Query separately
 *     (queryClient.clear()) — this helper does NOT touch RQ to avoid a
 *     dependency on the client instance.
 */
const SUPABASE_CACHE_NAMES = new Set([
  "supabase-cache",
  "supabase-public-assets",
]);

export async function purgeSupabaseBrowserCaches(): Promise<void> {
  if (typeof caches === "undefined") return;
  try {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter(
          (n) =>
            SUPABASE_CACHE_NAMES.has(n) ||
            n.toLowerCase().includes("supabase"),
        )
        .map((n) => caches.delete(n)),
    );
  } catch (err) {
    // Non-fatal: cache purge is best-effort
    console.warn("[auth-cache-purge] failed to clear caches:", err);
  }
}
