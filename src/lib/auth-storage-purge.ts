/**
 * F3: explicit purge of Supabase auth tokens from browser storage.
 *
 * supabase-js normally clears its own `sb-*-auth-token` entry on
 * signOut, but rotated keys, dev mode, or interrupted signOut can leave
 * stale entries behind. We scan both localStorage and sessionStorage
 * and remove anything matching the supabase-js storage key shape.
 */
const AUTH_KEY_RE = /^sb-.*-auth-token(\..*)?$/;

function purgeFrom(storage: Storage | undefined): void {
  if (!storage) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && AUTH_KEY_RE.test(k)) keys.push(k);
    }
    keys.forEach((k) => storage.removeItem(k));
  } catch {
    /* no-op */
  }
}

export function purgeSupabaseAuthStorage(): void {
  if (typeof window === "undefined") return;
  purgeFrom(window.localStorage);
  purgeFrom(window.sessionStorage);
}
