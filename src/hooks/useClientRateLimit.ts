import { useCallback, useRef } from "react";
import { toast } from "sonner";

/**
 * F4 — Client-side rate limiter for expensive mutations.
 * Token-bucket per key, persisted in-memory (resets on reload).
 * Returns guard(fn) that runs fn only if tokens available, otherwise toasts and skips.
 */
export function useClientRateLimit(opts?: {
  /** Max calls allowed in the window */
  capacity?: number;
  /** Window in ms to refill 1 token */
  refillMs?: number;
  /** Custom toast message when blocked */
  blockedMessage?: string;
}) {
  const capacity = opts?.capacity ?? 5;
  const refillMs = opts?.refillMs ?? 2000;
  const blockedMessage = opts?.blockedMessage ?? "Troppe richieste consecutive. Riprova tra qualche secondo.";

  const buckets = useRef<Map<string, { tokens: number; lastRefill: number }>>(new Map());

  const tryConsume = useCallback(
    (key: string): boolean => {
      const now = Date.now();
      const b = buckets.current.get(key) ?? { tokens: capacity, lastRefill: now };
      const elapsed = now - b.lastRefill;
      const refilled = Math.floor(elapsed / refillMs);
      if (refilled > 0) {
        b.tokens = Math.min(capacity, b.tokens + refilled);
        b.lastRefill = now;
      }
      if (b.tokens <= 0) {
        buckets.current.set(key, b);
        return false;
      }
      b.tokens -= 1;
      buckets.current.set(key, b);
      return true;
    },
    [capacity, refillMs],
  );

  const guard = useCallback(
    async <T,>(key: string, fn: () => Promise<T> | T): Promise<T | undefined> => {
      if (!tryConsume(key)) {
        toast.warning(blockedMessage);
        return undefined;
      }
      return await fn();
    },
    [tryConsume, blockedMessage],
  );

  return { guard, tryConsume };
}
