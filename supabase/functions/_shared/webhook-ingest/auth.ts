// Authentication helpers for webhook-ingest:
// - API key extraction (header / query / path / body)
// - Hash-based key verification (constant-time)
// - Anti-replay timestamp window check
import { hashSha256, constantTimeCompare } from "./hmac.ts";

/**
 * Verify an API key against its stored SHA-256 hash, constant-time.
 * Returns true if the key matches.
 */
export async function verifyApiKey(
  providedKey: string,
  storedHash: string,
): Promise<boolean> {
  const providedHash = await hashSha256(providedKey);
  return constantTimeCompare(providedHash, storedHash);
}

export interface ApiKeyExtractionInput {
  headerKey: string | null;
  queryKey: string | null;
  pathKey: string | null;
  bodyKey: string | null;
}

/**
 * Extract API key with fixed priority: header > query > path > body.
 * Returns the first non-empty value or null.
 *
 * Body key supports Google Ads Lead Forms (`google_key`) and similar
 * platforms that cannot send custom headers.
 */
export function extractApiKey(input: ApiKeyExtractionInput): string | null {
  return (
    input.headerKey?.trim() ||
    input.queryKey?.trim() ||
    input.pathKey?.trim() ||
    input.bodyKey?.trim() ||
    null
  );
}

export type ReplayCheckResult =
  | { ok: true; timestamp: number }
  | { ok: false; reason: "missing_timestamp" | "invalid_timestamp_format" | "replay_detected"; details?: Record<string, number> };

/**
 * Anti-replay timestamp window check.
 * `replayWindowSeconds` defaults to 300s (Stripe-style).
 * Returns granular reasons for caller to map to HTTP status / audit row.
 */
export function checkReplayTimestamp(
  timestampHeader: string | null,
  replayWindowSeconds: number,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): ReplayCheckResult {
  if (!timestampHeader) return { ok: false, reason: "missing_timestamp" };

  const ts = parseInt(timestampHeader, 10);
  if (Number.isNaN(ts)) return { ok: false, reason: "invalid_timestamp_format" };

  const diff = Math.abs(nowSeconds - ts);
  if (diff > replayWindowSeconds) {
    return {
      ok: false,
      reason: "replay_detected",
      details: { timestamp: ts, now: nowSeconds, diff, window: replayWindowSeconds },
    };
  }

  return { ok: true, timestamp: ts };
}
