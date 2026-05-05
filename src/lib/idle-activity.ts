const IDLE_ACTIVITY_STORAGE_KEY = "ralph.idle.lastActivity";

function getLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getStoredIdleActivity(): number | null {
  const storage = getLocalStorage();
  if (!storage) return null;
  const raw = storage.getItem(IDLE_ACTIVITY_STORAGE_KEY);
  if (!raw) return null;
  const ts = Number(raw);
  return Number.isFinite(ts) && ts > 0 ? ts : null;
}

export function markIdleActivity(ts = Date.now()): void {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(IDLE_ACTIVITY_STORAGE_KEY, String(ts));
  } catch {
    // no-op: localStorage may be unavailable in privacy mode
  }
}

export function clearIdleActivity(): void {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    storage.removeItem(IDLE_ACTIVITY_STORAGE_KEY);
  } catch {
    // no-op
  }
}