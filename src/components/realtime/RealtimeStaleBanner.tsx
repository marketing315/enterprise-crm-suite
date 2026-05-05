import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

/**
 * F8: passive banner that surfaces when realtime auth has been failing
 * to refresh. AuthContext fires a `realtime-stale` CustomEvent on every
 * sync attempt with `{ reason: 'ok' | 'expired' | 'retry', attempt?, delay? }`.
 *
 * Renders nothing when realtime is healthy. Mounted globally in MainLayout.
 */
export function RealtimeStaleBanner() {
  const [stale, setStale] = useState<null | { reason: string; attempt?: number }>(null);

  useEffect(() => {
    const onStale = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      if (detail.ok) {
        setStale(null);
        return;
      }
      if (detail.reason === "retry" || detail.reason === "expired") {
        setStale({ reason: detail.reason, attempt: detail.attempt });
      }
    };
    window.addEventListener("realtime-stale", onStale);
    return () => window.removeEventListener("realtime-stale", onStale);
  }, []);

  if (!stale) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-50 px-4 py-2 text-xs text-amber-900 shadow-md dark:bg-amber-950/40 dark:text-amber-100"
    >
      <AlertTriangle className="h-3.5 w-3.5" />
      <span>
        Connessione real-time in riconnessione
        {stale.attempt ? ` (tentativo ${stale.attempt})` : "…"}
      </span>
    </div>
  );
}
