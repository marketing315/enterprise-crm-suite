/**
 * C5 — Internal mTLS-equivalent mutual auth for inter-function calls.
 *
 * Edge Functions on Deno Deploy do not expose client-cert mTLS.
 * We achieve the equivalent guarantees with HMAC-SHA256 signed envelopes:
 *
 *   - Caller identity (`x-internal-caller`) is part of the signed payload.
 *   - Per-request `x-internal-nonce` (uuid) prevents replay.
 *   - `x-internal-timestamp` (unix ms) bounds the window to ±60s.
 *   - `x-internal-signature` = HMAC_SHA256(secret, `${ts}.${nonce}.${caller}.${method}.${path}.${bodyHash}`).
 *   - Replay-guard via table `internal_auth_nonces` (TTL 5 min, service-role RLS).
 *   - Caller allow-list per callee (defense-in-depth).
 *
 * Backwards-compatible: callees still accept the legacy
 * `INTERNAL_SERVICE_TOKEN` shared-secret header until all callers are migrated.
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const ENC = new TextEncoder();
const MAX_SKEW_MS = 60_000;
const NONCE_TTL_MS = 5 * 60_000;

let cachedKey: CryptoKey | null = null;

async function getHmacKey(secret: string): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  cachedKey = await crypto.subtle.importKey(
    "raw",
    ENC.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  return cachedKey;
}

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(s: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", ENC.encode(s)));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function buildBase(
  ts: string,
  nonce: string,
  caller: string,
  method: string,
  path: string,
  bodyHash: string,
): string {
  return `${ts}.${nonce}.${caller}.${method.toUpperCase()}.${path}.${bodyHash}`;
}

/**
 * Sign an outbound internal request and return the headers to attach.
 * Use it like:
 *   const headers = await signInternalRequest({ caller: 'webhook-ingest', method: 'POST', url, body });
 *   await fetch(url, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body });
 */
export async function signInternalRequest(opts: {
  caller: string;
  method: string;
  url: string;
  body?: string | Uint8Array | null;
  /** Override secret (defaults to INTERNAL_SERVICE_TOKEN). */
  secret?: string;
}): Promise<Record<string, string>> {
  const secret = opts.secret ?? Deno.env.get("INTERNAL_SERVICE_TOKEN") ?? "";
  if (!secret) throw new Error("INTERNAL_SERVICE_TOKEN missing — cannot sign internal request");

  const u = new URL(opts.url);
  const path = u.pathname + (u.search || "");
  const ts = Date.now().toString();
  const nonce = crypto.randomUUID();

  const bodyStr =
    opts.body == null
      ? ""
      : typeof opts.body === "string"
      ? opts.body
      : new TextDecoder().decode(opts.body);
  const bodyHash = await sha256Hex(bodyStr);

  const base = buildBase(ts, nonce, opts.caller, opts.method, path, bodyHash);
  const key = await getHmacKey(secret);
  const sig = hex(await crypto.subtle.sign("HMAC", key, ENC.encode(base)));

  return {
    "x-internal-caller": opts.caller,
    "x-internal-timestamp": ts,
    "x-internal-nonce": nonce,
    "x-internal-signature": sig,
    // Keep legacy header so callees still on the old check accept us.
    // TODO(H5, target Q3 2026): remove `x-internal-token` once all callees
    // verify HMAC. Tracked in mem://features/h5-webhook-retry-hardening.
    "x-internal-token": secret,
  };
}

export type VerifyResult =
  | { ok: true; caller: string; mode: "signed" | "legacy" }
  | { ok: false; status: number; error: string };

/**
 * Verify an inbound internal request.
 * Pass `allowedCallers` (defense-in-depth) — only those identities are accepted.
 * Pass the already-read `rawBody` text so we don't consume the request stream twice.
 */
export async function verifyInternalRequest(opts: {
  req: Request;
  rawBody: string;
  allowedCallers: readonly string[];
  /** Override secret (defaults to INTERNAL_SERVICE_TOKEN). */
  secret?: string;
  /** Allow legacy shared-token while we migrate callers. Default true. */
  allowLegacyToken?: boolean;
  /**
   * Optional Supabase service-role client used for the nonce replay-guard.
   * If omitted, we lazily build one from SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
   * Pass `null` to disable replay-guard (NOT recommended).
   */
  supabase?: SupabaseClient | null;
}): Promise<VerifyResult> {
  const secret = opts.secret ?? Deno.env.get("INTERNAL_SERVICE_TOKEN") ?? "";
  if (!secret) return { ok: false, status: 500, error: "internal secret not configured" };

  const allowLegacy = opts.allowLegacyToken !== false;
  const sig = opts.req.headers.get("x-internal-signature") || "";
  const ts = opts.req.headers.get("x-internal-timestamp") || "";
  const nonce = opts.req.headers.get("x-internal-nonce") || "";
  const caller = opts.req.headers.get("x-internal-caller") || "";

  // Path A — signed request (preferred)
  if (sig && ts && nonce && caller) {
    if (!opts.allowedCallers.includes(caller)) {
      return { ok: false, status: 403, error: `caller '${caller}' not allowed` };
    }
    const tsNum = Number(ts);
    if (!Number.isFinite(tsNum)) {
      return { ok: false, status: 401, error: "invalid timestamp" };
    }
    if (Math.abs(Date.now() - tsNum) > MAX_SKEW_MS) {
      return { ok: false, status: 401, error: "timestamp out of window" };
    }

    const u = new URL(opts.req.url);
    const path = u.pathname + (u.search || "");
    const bodyHash = await sha256Hex(opts.rawBody);
    const base = buildBase(ts, nonce, caller, opts.req.method, path, bodyHash);
    const key = await getHmacKey(secret);
    const expected = hex(await crypto.subtle.sign("HMAC", key, ENC.encode(base)));
    if (!timingSafeEqual(expected, sig)) {
      return { ok: false, status: 401, error: "bad signature" };
    }

    // Replay-guard
    const supa =
      opts.supabase === undefined
        ? createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
            { auth: { persistSession: false } },
          )
        : opts.supabase;
    if (supa) {
      const expiresAt = new Date(Date.now() + NONCE_TTL_MS).toISOString();
      const { error } = await supa
        .from("internal_auth_nonces")
        .insert({ nonce, caller, expires_at: expiresAt });
      if (error) {
        // PK violation = replay; everything else = fail-closed
        const code = (error as { code?: string }).code;
        if (code === "23505") {
          return { ok: false, status: 401, error: "replayed nonce" };
        }
        console.error("[internal-mtls] nonce insert failed", error);
        return { ok: false, status: 500, error: "replay-guard unavailable" };
      }
    }

    return { ok: true, caller, mode: "signed" };
  }

  // Path B — legacy shared-token (kept until all callers are migrated)
  if (allowLegacy) {
    const legacy =
      opts.req.headers.get("x-internal-token") ||
      opts.req.headers.get("x-internal-forward") ||
      "";
    if (legacy && timingSafeEqual(legacy, secret)) {
      const legacyCaller = caller || "legacy";
      return { ok: true, caller: legacyCaller, mode: "legacy" };
    }
  }

  return { ok: false, status: 401, error: "missing or invalid internal auth" };
}
