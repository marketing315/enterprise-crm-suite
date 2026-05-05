// H8: Idempotency helper for sensitive POST endpoints.
//
// Usage:
//   const idem = await beginIdempotency(supabaseAdmin, {
//     scope: "voispeed-call-request",
//     callerId: userInternalId,
//     callerFp: extractClientIp(req) ?? "unknown",
//     idemKey: req.headers.get("Idempotency-Key"),
//     payload: rawBodyString,
//   });
//   if (idem.kind === "missing") { return safeClientError("bad_request", { ... }); }
//   if (idem.kind === "replay")  { return idem.cachedResponse(); }
//   if (idem.kind === "in_progress") { return idem.inProgressResponse(); }
//   if (idem.kind === "payload_mismatch") { return idem.mismatchResponse(); }
//
//   try {
//     const { status, body } = await doWork();
//     await idem.complete(status, body);
//     return new Response(JSON.stringify(body), { status, headers: ... });
//   } catch (e) {
//     await idem.fail(500, { error: "internal" });
//     throw e;
//   }
//
// All retries — first call AND replays — are recorded as append-only events in
// public.idempotency_events for observability.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const ENC = new TextEncoder();

async function sha256(s: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", ENC.encode(s));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface BeginIdemArgs {
  scope: string;
  callerId?: string | null;
  callerFp: string;
  idemKey: string | null | undefined;
  payload: string; // raw body or canonicalized JSON string
  ttlSeconds?: number;
  /** When true, requests without Idempotency-Key are allowed (returns kind:'no_key'). */
  optional?: boolean;
}

export type IdempotencyResult =
  | { kind: "missing" }
  | { kind: "no_key" }
  | {
      kind: "inserted";
      keyId: string;
      complete: (status: number, body: unknown) => Promise<void>;
      fail: (status: number, body: unknown) => Promise<void>;
    }
  | {
      kind: "in_progress";
      keyId: string;
      inProgressResponse: (extraHeaders?: Record<string, string>) => Response;
    }
  | {
      kind: "replay";
      keyId: string;
      cachedStatus: number;
      cachedBody: unknown;
      cachedResponse: (extraHeaders?: Record<string, string>) => Response;
    }
  | {
      kind: "payload_mismatch";
      keyId: string;
      mismatchResponse: (extraHeaders?: Record<string, string>) => Response;
    };

const IDEM_KEY_RE = /^[A-Za-z0-9._:\-]{8,128}$/;

export async function beginIdempotency(
  supabase: SupabaseClient,
  args: BeginIdemArgs,
): Promise<IdempotencyResult> {
  const key = (args.idemKey ?? "").trim();
  if (!key) {
    return args.optional ? { kind: "no_key" } : { kind: "missing" };
  }
  if (!IDEM_KEY_RE.test(key)) {
    return { kind: "missing" };
  }

  const payloadFp = await sha256(args.payload ?? "");
  const { data, error } = await supabase.rpc("claim_idempotency_key", {
    p_scope: args.scope,
    p_caller_id: args.callerId ?? null,
    p_caller_fp: args.callerFp.slice(0, 200),
    p_idem_key: key,
    p_payload_fp: payloadFp,
    p_ttl_seconds: args.ttlSeconds ?? 86400,
  });

  if (error || !data || !data[0]) {
    // Fail-open: if idempotency store is unavailable we still serve, but do not record cache.
    console.error("[idempotency] claim failed; serving without dedup", error);
    return { kind: "no_key" };
  }

  const row = data[0] as {
    outcome: "inserted" | "replay" | "in_progress" | "payload_mismatch";
    key_id: string;
    cached_status: number | null;
    cached_body: unknown;
  };

  switch (row.outcome) {
    case "inserted":
      return {
        kind: "inserted",
        keyId: row.key_id,
        complete: (status, body) => completeKey(supabase, row.key_id, status, body, false),
        fail: (status, body) => completeKey(supabase, row.key_id, status, body, true),
      };
    case "in_progress":
      return {
        kind: "in_progress",
        keyId: row.key_id,
        inProgressResponse: (extraHeaders = {}) =>
          new Response(
            JSON.stringify({
              error: {
                code: "conflict",
                message: "Request with this Idempotency-Key is still in progress.",
              },
            }),
            {
              status: 409,
              headers: {
                "Content-Type": "application/json",
                "Retry-After": "2",
                "Idempotency-Key": key,
                "Idempotency-Replay": "in-progress",
                ...extraHeaders,
              },
            },
          ),
      };
    case "replay":
      return {
        kind: "replay",
        keyId: row.key_id,
        cachedStatus: row.cached_status ?? 200,
        cachedBody: row.cached_body,
        cachedResponse: (extraHeaders = {}) =>
          new Response(JSON.stringify(row.cached_body ?? {}), {
            status: row.cached_status ?? 200,
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": key,
              "Idempotency-Replay": "true",
              ...extraHeaders,
            },
          }),
      };
    case "payload_mismatch":
      return {
        kind: "payload_mismatch",
        keyId: row.key_id,
        mismatchResponse: (extraHeaders = {}) =>
          new Response(
            JSON.stringify({
              error: {
                code: "conflict",
                message: "Idempotency-Key already used with a different payload.",
              },
            }),
            {
              status: 409,
              headers: {
                "Content-Type": "application/json",
                "Idempotency-Key": key,
                ...extraHeaders,
              },
            },
          ),
      };
  }
}

async function completeKey(
  supabase: SupabaseClient,
  keyId: string,
  status: number,
  body: unknown,
  failed: boolean,
): Promise<void> {
  // Truncate large bodies to keep cache row small (≈ 32KB JSON).
  let cached: unknown = body;
  try {
    const s = JSON.stringify(body);
    if (s.length > 32768) {
      cached = { _truncated: true, status };
    }
  } catch {
    cached = { _unserializable: true };
  }
  const { error } = await supabase.rpc("complete_idempotency_key", {
    p_key_id: keyId,
    p_response_status: status,
    p_response_body: cached,
    p_failed: failed,
  });
  if (error) {
    console.error("[idempotency] complete failed", error);
  }
}
