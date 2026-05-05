/**
 * Client-side wrapper per il rate-limit auth (finding A4-A10).
 * - identity_hash = SHA-256(email_lowercased + '|' + scope)
 *   (browser-only: hash deterministico, no PII in chiaro al server lato logging)
 * - chiama RPC consume_auth_rate_limit prima di signin / password reset
 * - chiama reset_auth_rate_limit dopo signin OK
 */
import { supabase } from "@/integrations/supabase/client";

export type RateLimitScope = "signin" | "password_reset";

export interface RateLimitResult {
  allowed: boolean;
  locked?: boolean;
  retry_after_seconds?: number;
  attempts_remaining?: number;
  error?: string;
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hashBuf = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function buildIdentityHash(email: string, scope: RateLimitScope): Promise<string> {
  const normalized = email.trim().toLowerCase();
  return sha256Hex(`${normalized}|${scope}`);
}

export async function consumeAuthRateLimit(
  email: string,
  scope: RateLimitScope,
): Promise<RateLimitResult> {
  try {
    const hash = await buildIdentityHash(email, scope);
    const { data, error } = await supabase.rpc("consume_auth_rate_limit", {
      p_identity_hash: hash,
      p_scope: scope,
    });
    if (error) {
      // fail-open: non bloccare il login se il backend RPC è giù.
      console.warn("auth rate-limit RPC error, failing open", error);
      return { allowed: true };
    }
    return (data as RateLimitResult) ?? { allowed: true };
  } catch (e) {
    console.warn("auth rate-limit failed, failing open", e);
    return { allowed: true };
  }
}

export async function resetAuthRateLimit(email: string, scope: RateLimitScope): Promise<void> {
  try {
    const hash = await buildIdentityHash(email, scope);
    await supabase.rpc("reset_auth_rate_limit", {
      p_identity_hash: hash,
      p_scope: scope,
    });
  } catch {
    // best-effort
  }
}

export function formatRetryAfter(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.ceil(seconds / 60);
  return `${m} minut${m === 1 ? "o" : "i"}`;
}
