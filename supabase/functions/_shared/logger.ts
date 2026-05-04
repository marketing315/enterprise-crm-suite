// Structured JSON logger for Supabase Edge Functions.
//
// Why: `console.log("foo", obj)` in Deno produces non-parseable lines
// (multi-arg, embedded newlines, ANSI codes from inspect()). Log shippers
// (Logflare, SIEM, Datadog) need single-line JSON to index level/fn/msg/fields.
//
// Usage:
//   import { createLogger } from "../_shared/logger.ts";
//   const log = createLogger("webhook-ingest");
//   log.info("request received", { requestId, sourceId });
//   log.error("db failed", { err: String(err) });
//
// Output (stdout, one line per call):
//   {"ts":"2026-05-04T12:34:56.789Z","lvl":"info","fn":"webhook-ingest",
//    "msg":"request received","requestId":"...","sourceId":"..."}
//
// Rules:
// - NEVER pass raw Error objects (not JSON-serializable). Use String(err) or err.message.
// - NEVER log secrets, tokens, full bodies. Cap large fields in the caller.
// - Reserved keys (ts, lvl, fn, msg) in `fields` are ignored.

export type LogLevel = "debug" | "info" | "warn" | "error";

const RESERVED = new Set(["ts", "lvl", "fn", "msg"]);

function emit(fn: string, lvl: LogLevel, msg: string, fields?: Record<string, unknown>): void {
  const record: Record<string, unknown> = {
    ts: new Date().toISOString(),
    lvl,
    fn,
    msg,
  };
  if (fields) {
    for (const [k, v] of Object.entries(fields)) {
      if (RESERVED.has(k)) continue;
      record[k] = v;
    }
  }
  let line: string;
  try {
    line = JSON.stringify(record);
  } catch {
    // Circular ref or BigInt — fall back to safe stringification.
    line = JSON.stringify({
      ts: record.ts,
      lvl,
      fn,
      msg,
      _serialization_error: true,
    });
  }
  // Route warn/error to stderr so platforms that split streams keep severity.
  if (lvl === "error" || lvl === "warn") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  /** Returns a child logger that merges baseFields into every record. */
  child(baseFields: Record<string, unknown>): Logger;
}

function build(fn: string, base: Record<string, unknown> | null): Logger {
  const merge = (extra?: Record<string, unknown>) =>
    base ? { ...base, ...(extra ?? {}) } : extra;
  return {
    debug: (msg, f) => emit(fn, "debug", msg, merge(f)),
    info: (msg, f) => emit(fn, "info", msg, merge(f)),
    warn: (msg, f) => emit(fn, "warn", msg, merge(f)),
    error: (msg, f) => emit(fn, "error", msg, merge(f)),
    child: (baseFields) => build(fn, { ...(base ?? {}), ...baseFields }),
  };
}

export function createLogger(fn: string): Logger {
  return build(fn, null);
}
