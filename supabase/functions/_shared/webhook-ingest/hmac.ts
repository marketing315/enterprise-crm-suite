// HMAC-SHA256 helpers for webhook signature verification.
// Pure functions, no I/O, no external dependencies (except WebCrypto).
import { timingSafeEqual } from "../crypto.ts";

/** SHA-256 hex digest of an arbitrary string. */
export async function hashSha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** HMAC-SHA256 hex digest of `message` using `secret`. */
export async function computeHmacSha256(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Constant-time string comparison (re-export). */
export function constantTimeCompare(a: string, b: string): boolean {
  return timingSafeEqual(a, b);
}

export interface HmacVerificationInput {
  /** Raw request body, exactly as received (no re-serialization). */
  bodyText: string;
  /** Source secret. */
  secret: string;
  /** Header value (X-Signature or X-Webhook-Signature). */
  signatureHeader: string;
  /** Optional X-Timestamp (Unix seconds, as string). */
  timestampHeader: string | null;
  /**
   * If true, treat as Systeme.io flow:
   * - signature is plain hex (no `sha256=` prefix)
   * - signed message is the raw body (no `{ts}.{body}` wrapping)
   * - timestamp is not used
   */
  isSystemeIo: boolean;
}

export type HmacVerificationResult =
  | { ok: true }
  | { ok: false; reason: "invalid_signature_format" | "invalid_signature" };

/**
 * Verify a webhook HMAC signature.
 *
 * Supports two flows:
 *  - **Standard**: `X-Signature: sha256=<hex>`, signed message is `${ts}.${body}`.
 *  - **Systeme.io**: `X-Webhook-Signature: <hex>`, signed message is the raw body.
 *
 * Returns granular reasons so callers can map to HTTP status (400 vs 401).
 */
export async function verifyHmacSignature(
  input: HmacVerificationInput,
): Promise<HmacVerificationResult> {
  let provided: string;
  let expected: string;

  if (input.isSystemeIo) {
    provided = input.signatureHeader.toLowerCase();
    expected = await computeHmacSha256(input.secret, input.bodyText);
  } else {
    const m = input.signatureHeader.match(/^sha256=([a-f0-9]{64})$/i);
    if (!m) return { ok: false, reason: "invalid_signature_format" };
    provided = m[1].toLowerCase();
    const signedMessage = `${input.timestampHeader ?? ""}.${input.bodyText}`;
    expected = await computeHmacSha256(input.secret, signedMessage);
  }

  return constantTimeCompare(provided, expected)
    ? { ok: true }
    : { ok: false, reason: "invalid_signature" };
}
