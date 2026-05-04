/**
 * User-scoped localStorage helper.
 *
 * Wraps localStorage so that UI preferences (filters, saved views, sidebar
 * state, …) are namespaced under the currently authenticated user id.
 *
 * Why: on shared devices (e.g. a callcenter workstation) two operators
 * logging in sequentially must NOT see each other's filters or saved
 * presets. Without namespacing, user B inherits user A's UI state on the
 * same browser profile.
 *
 * GDPR: every key written through this helper is wiped on signOut by
 * `purgeUserScopedStorage()`. It is also wiped automatically when a
 * different user logs in (detected via `currentUserId` change).
 *
 * Usage:
 *   import { userStorage } from "@/lib/userScopedStorage";
 *   userStorage.setItem("appointment-filters", JSON.stringify(filters));
 *   const raw = userStorage.getItem("appointment-filters");
 *
 * Existing call sites that read raw localStorage directly continue to
 * work — this helper is additive and does not migrate legacy keys.
 */

const PREFIX = "uscope::"; // "uscope::<userId>::<key>"

let currentUserId: string | null = null;

function buildKey(userId: string, key: string): string {
  return `${PREFIX}${userId}::${key}`;
}

/**
 * Set the active user id. Call this from AuthContext when the session
 * changes. Passing `null` (e.g. after signOut) makes all subsequent
 * reads/writes no-ops.
 */
export function setUserScope(userId: string | null): void {
  if (currentUserId && currentUserId !== userId) {
    // User switched (or logged out) — purge the *previous* user's keys
    // before activating the new scope.
    purgeUserScopedStorage(currentUserId);
  }
  currentUserId = userId;
}

/**
 * Wipe every `uscope::*` entry, optionally restricted to a specific user.
 * Called automatically on signOut and on user switch.
 */
export function purgeUserScopedStorage(userId?: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    const target = userId ? `${PREFIX}${userId}::` : PREFIX;
    const toDelete: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(target)) toDelete.push(k);
    }
    toDelete.forEach((k) => localStorage.removeItem(k));
  } catch (err) {
    console.warn("[userScopedStorage] purge failed:", err);
  }
}

/**
 * Storage façade. Behaves like localStorage but transparently scopes
 * keys to the active user. No-op (and returns null on get) when no user
 * is signed in — protecting against accidental writes on the login page.
 */
export const userStorage = {
  getItem(key: string): string | null {
    if (!currentUserId || typeof localStorage === "undefined") return null;
    try {
      return localStorage.getItem(buildKey(currentUserId, key));
    } catch {
      return null;
    }
  },

  setItem(key: string, value: string): void {
    if (!currentUserId || typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(buildKey(currentUserId, key), value);
    } catch (err) {
      console.warn("[userScopedStorage] setItem failed:", err);
    }
  },

  removeItem(key: string): void {
    if (!currentUserId || typeof localStorage === "undefined") return;
    try {
      localStorage.removeItem(buildKey(currentUserId, key));
    } catch {
      /* no-op */
    }
  },
};
