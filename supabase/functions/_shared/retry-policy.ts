// _shared/retry-policy.ts
// H7 — Single source of truth for retry/backoff policy used by all dispatchers.
//
// Cap: 5 attempts. Backoff (between attempts): 250ms, 1s, 5s, 30s, 5min.
// Dispatchers that run on cron tick should use computeNextAttemptAt() to set
// next_attempt_at and refuse to schedule a 6th attempt.

export const RETRY_POLICY = {
  /** Hard cap on total attempts (1-based). The 6th never runs. */
  MAX_ATTEMPTS: 5,
  /** Backoff between attempt N and attempt N+1, indexed by current attempt_count (0-based). */
  BACKOFF_MS: [250, 1_000, 5_000, 30_000, 5 * 60_000] as const,
} as const;

/**
 * Returns the next attempt timestamp given the count of attempts already consumed.
 * If attempts >= MAX_ATTEMPTS, returns null (caller MUST move row to DLQ).
 */
export function computeNextAttemptAt(attemptsSoFar: number, now: Date = new Date()): Date | null {
  if (attemptsSoFar >= RETRY_POLICY.MAX_ATTEMPTS) return null;
  const idx = Math.min(attemptsSoFar, RETRY_POLICY.BACKOFF_MS.length - 1);
  const jitter = Math.random() * 0.2 * RETRY_POLICY.BACKOFF_MS[idx]; // ±20%
  return new Date(now.getTime() + RETRY_POLICY.BACKOFF_MS[idx] + jitter);
}

/**
 * Classifies an HTTP/network error as retryable.
 *  - 5xx, 408, 425, 429, network/timeout → retryable
 *  - everything else (4xx) → terminal, move to DLQ immediately
 */
export function isRetryableError(opts: {
  httpStatus?: number | null;
  errorMessage?: string | null;
}): boolean {
  const { httpStatus, errorMessage } = opts;
  if (httpStatus != null) {
    if (httpStatus >= 500) return true;
    if ([408, 425, 429].includes(httpStatus)) return true;
    return false;
  }
  // Network / timeout / DNS / connection reset → retryable
  if (errorMessage) {
    const m = errorMessage.toLowerCase();
    if (
      m.includes("timeout") ||
      m.includes("econnreset") ||
      m.includes("enotfound") ||
      m.includes("network") ||
      m.includes("fetch failed") ||
      m.includes("aborted") ||
      m.includes("socket hang up")
    ) {
      return true;
    }
  }
  return true; // default: retry on unknown errors (fail-open within MAX_ATTEMPTS)
}
