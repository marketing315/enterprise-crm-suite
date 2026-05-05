// H6: Coherent, PII-safe error responses for edge functions.
//
// Goals:
//  - Never leak PII, stack traces, DB driver messages, or internal identifiers to clients.
//  - Always return a stable shape: { error: { code, message, error_id } }.
//  - Log the full (redacted) error server-side with the same error_id so support can correlate.
//
// Usage:
//   try { ... }
//   catch (e) {
//     return safeErrorResponse(e, { status: 500, code: "internal_error", extraHeaders: corsHeaders });
//   }

import { redactPII } from "./pii-redact.ts";

export type SafeErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "validation_error"
  | "unprocessable"
  | "internal_error"
  | "upstream_error"
  | "service_unavailable";

const STATUS_TO_CODE: Record<number, SafeErrorCode> = {
  400: "bad_request",
  401: "unauthorized",
  403: "forbidden",
  404: "not_found",
  409: "conflict",
  422: "unprocessable",
  429: "rate_limited",
  500: "internal_error",
  502: "upstream_error",
  503: "service_unavailable",
};

const CODE_TO_PUBLIC_MESSAGE: Record<SafeErrorCode, string> = {
  bad_request: "Invalid request.",
  unauthorized: "Authentication required.",
  forbidden: "Access denied.",
  not_found: "Resource not found.",
  conflict: "Conflict with current resource state.",
  rate_limited: "Too many requests. Please retry later.",
  validation_error: "Request validation failed.",
  unprocessable: "Request could not be processed.",
  internal_error: "An unexpected error occurred. Please try again.",
  upstream_error: "An upstream service is unavailable.",
  service_unavailable: "Service temporarily unavailable.",
};

export interface SafeErrorOptions {
  /** HTTP status code (default 500). */
  status?: number;
  /** Override the inferred error code. */
  code?: SafeErrorCode;
  /** Additional headers (typically CORS) merged into the response. */
  extraHeaders?: Record<string, string>;
  /**
   * Optional structured details to include for client-handled cases (e.g. Zod issues).
   * The object is PII-redacted before being attached to the response.
   * Only use for codes like `validation_error` where the client needs field-level info.
   */
  details?: unknown;
  /** Correlation id (e.g. trace id). If absent, a new UUID is generated. */
  errorId?: string;
  /** Optional context recorded server-side (function name, route). */
  logContext?: Record<string, unknown>;
}

function newId(): string {
  // crypto.randomUUID is available in Deno runtime
  try {
    return crypto.randomUUID();
  } catch {
    return `err_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

function summarizeError(err: unknown): { name: string; message: string; stack?: string } {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  if (typeof err === "string") return { name: "Error", message: err };
  try {
    return { name: "Error", message: JSON.stringify(err) };
  } catch {
    return { name: "Error", message: String(err) };
  }
}

/**
 * Build a coherent, PII-safe error Response.
 * Logs full (redacted) error to console with error_id; returns a generic message to the client.
 */
export function safeErrorResponse(err: unknown, opts: SafeErrorOptions = {}): Response {
  const status = opts.status ?? 500;
  const code = opts.code ?? STATUS_TO_CODE[status] ?? "internal_error";
  const errorId = opts.errorId ?? newId();
  const publicMessage = CODE_TO_PUBLIC_MESSAGE[code];

  // Server-side log: full error, redacted, correlated by error_id.
  const summary = summarizeError(err);
  try {
    console.error(
      JSON.stringify({
        level: "error",
        error_id: errorId,
        code,
        status,
        ctx: opts.logContext ?? null,
        err: redactPII({
          name: summary.name,
          message: summary.message,
          // Stack stays server-side only.
          stack: summary.stack,
        }),
      }),
    );
  } catch {
    // logging must never throw
  }

  const body: Record<string, unknown> = {
    error: {
      code,
      message: publicMessage,
      error_id: errorId,
    },
  };

  if (opts.details !== undefined) {
    // Redact details before exposing them. Only intended for validation_error / bad_request.
    (body.error as Record<string, unknown>).details = redactPII(opts.details);
  }

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Error-Id": errorId,
      ...(opts.extraHeaders ?? {}),
    },
  });
}

/**
 * Convenience for clear client errors (validation, missing auth, etc.) where the message itself is safe.
 * Still returns the standard shape so clients can rely on it.
 */
export function safeClientError(
  code: SafeErrorCode,
  opts: Omit<SafeErrorOptions, "code"> & { status?: number } = {},
): Response {
  const statusByCode: Partial<Record<SafeErrorCode, number>> = {
    bad_request: 400,
    unauthorized: 401,
    forbidden: 403,
    not_found: 404,
    conflict: 409,
    validation_error: 422,
    unprocessable: 422,
    rate_limited: 429,
  };
  const status = opts.status ?? statusByCode[code] ?? 400;
  return safeErrorResponse(new Error(code), { ...opts, code, status });
}
