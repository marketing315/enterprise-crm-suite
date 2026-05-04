// Idempotency / replay deduplication helpers.
// Pure logic only — DB writes happen in index.ts.
import { hashSha256 } from "./hmac.ts";

/**
 * Compute the dedup fingerprint for a request.
 * Priority:
 *   1. HMAC signature (when present) — strongest, includes timestamp+body.
 *   2. SHA-256 of bodyText — works for any source.
 *
 * Result is capped at 256 chars to fit the DB column.
 */
export async function computeFingerprint(
  signatureHeader: string | null,
  bodyText: string,
): Promise<string> {
  const input = signatureHeader
    ? `sig:${signatureHeader}`
    : `body:${await hashSha256(bodyText)}`;
  return input.slice(0, 256);
}

/**
 * Map an internal error string to a DLQ reason for `incoming_requests.dlq_reason`.
 * Returns null when the error is an auth/setup failure that should NOT be queued
 * (e.g. invalid_api_key, source_not_found).
 */
export type DlqReason =
  | "invalid_json"
  | "mapping_error"
  | "missing_required"
  | "schema_validation_failed"
  | "signature_failed"
  | "rate_limited"
  | "ai_extraction_failed"
  | "contact_creation_failed"
  | "unknown_error";

export function mapErrorToDlqReason(errorMessage: string | null): DlqReason | null {
  if (!errorMessage) return null;
  if (errorMessage === "invalid_json") return "invalid_json";
  if (errorMessage.startsWith("schema_validation_failed")) return "schema_validation_failed";
  if (errorMessage.includes("signature") ||
      errorMessage === "invalid_signature" ||
      errorMessage === "invalid_signature_format") return "signature_failed";
  if (errorMessage === "rate_limited") return "rate_limited";
  if (errorMessage.includes("mapping")) return "mapping_error";
  if (errorMessage.includes("ai_extraction") || errorMessage === "phone_required") return "ai_extraction_failed";
  if (errorMessage.includes("contact_creation")) return "contact_creation_failed";
  if (errorMessage === "missing_phone" || errorMessage.includes("missing_required")) return "missing_required";
  return null;
}
