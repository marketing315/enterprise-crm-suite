// Shared helper to safely parse JSON responses from external APIs.
//
// Why: many providers (Meta Graph, Google OAuth/Ads, AI Gateway, n8n) can return
// non-JSON bodies (HTML throttling pages, gateway error pages, empty bodies)
// even on a 200 OK. A naked `await res.json()` then throws and rolls back any
// in-progress logic — including DB transactions in webhooks. This helper:
//   1. ALWAYS consumes the response body (Deno requires it to avoid resource leaks).
//   2. Returns a discriminated result `{ ok, data, status, error?, body?, fallback }`.
//   3. Marks 5xx + parse failures as `fallback: true` so callers can retry/queue.
//
// Usage:
//   const r = await safeJson<MyShape>(await fetch(url));
//   if (!r.ok) { /* log r.error / r.body and decide retry vs hard-fail */ }
//   const data = r.data; // typed
//
// Never throws. Callers can always rely on the returned object.

export type SafeJsonResult<T> =
  | { ok: true; data: T; status: number; fallback: false }
  | {
      ok: false;
      data: null;
      status: number;
      error: SafeJsonErrorCode;
      /** Raw body (truncated to 2000 chars) for debugging — never persist as-is. */
      body: string;
      /** True for transient failures: 5xx, network, parse error. Caller should retry/queue. */
      fallback: boolean;
    };

export type SafeJsonErrorCode =
  | "HTTP_ERROR" // non-2xx with a parseable or text body
  | "JSON_PARSE_ERROR" // 2xx but body is not valid JSON (HTML throttling, empty, etc.)
  | "EMPTY_BODY" // 2xx with zero-length body
  | "NETWORK_ERROR"; // exception at fetch layer (caller passes Error)

const MAX_BODY_LOG = 2000;

function truncate(s: string): string {
  if (s.length <= MAX_BODY_LOG) return s;
  return `${s.slice(0, MAX_BODY_LOG)}…[truncated ${s.length - MAX_BODY_LOG} bytes]`;
}

/**
 * Safely parse a fetch Response as JSON.
 * - Always consumes the body (no resource leak).
 * - Never throws.
 * - On non-2xx returns { ok:false, error:"HTTP_ERROR", body, fallback: status>=500 }.
 * - On 2xx with invalid JSON returns { ok:false, error:"JSON_PARSE_ERROR", body, fallback:true }.
 */
export async function safeJson<T = unknown>(response: Response): Promise<SafeJsonResult<T>> {
  let raw = "";
  try {
    raw = await response.text();
  } catch (_err) {
    return {
      ok: false,
      data: null,
      status: response.status,
      error: "NETWORK_ERROR",
      body: "",
      fallback: true,
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      data: null,
      status: response.status,
      error: "HTTP_ERROR",
      body: truncate(raw),
      fallback: response.status >= 500 || response.status === 408 || response.status === 429,
    };
  }

  if (raw.length === 0) {
    return {
      ok: false,
      data: null,
      status: response.status,
      error: "EMPTY_BODY",
      body: "",
      fallback: true,
    };
  }

  try {
    return { ok: true, data: JSON.parse(raw) as T, status: response.status, fallback: false };
  } catch (_err) {
    return {
      ok: false,
      data: null,
      status: response.status,
      error: "JSON_PARSE_ERROR",
      body: truncate(raw),
      fallback: true,
    };
  }
}

/**
 * Wrapper that performs the fetch AND the safe JSON parse, capturing network errors.
 * Use when you want a single call site that never throws.
 */
export async function safeFetchJson<T = unknown>(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<SafeJsonResult<T>> {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch (err) {
    return {
      ok: false,
      data: null,
      status: 0,
      error: "NETWORK_ERROR",
      body: err instanceof Error ? err.message : String(err),
      fallback: true,
    };
  }
  return safeJson<T>(response);
}
