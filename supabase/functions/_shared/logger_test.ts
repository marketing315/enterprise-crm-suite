import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createLogger } from "./logger.ts";

function captureStdout(fn: () => void): string[] {
  const lines: string[] = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...args: unknown[]) => { lines.push(String(args[0])); };
  console.error = (...args: unknown[]) => { lines.push(String(args[0])); };
  try { fn(); } finally {
    console.log = origLog;
    console.error = origErr;
  }
  return lines;
}

Deno.test("logger: emits single-line JSON with ts/lvl/fn/msg", () => {
  const log = createLogger("test-fn");
  const [line] = captureStdout(() => log.info("hello", { x: 1 }));
  const parsed = JSON.parse(line);
  assertEquals(parsed.lvl, "info");
  assertEquals(parsed.fn, "test-fn");
  assertEquals(parsed.msg, "hello");
  assertEquals(parsed.x, 1);
  assert(typeof parsed.ts === "string");
});

Deno.test("logger: reserved keys in fields are ignored", () => {
  const log = createLogger("test-fn");
  const [line] = captureStdout(() => log.warn("m", { fn: "evil", lvl: "debug", msg: "xx", k: "v" }));
  const parsed = JSON.parse(line);
  assertEquals(parsed.fn, "test-fn");
  assertEquals(parsed.lvl, "warn");
  assertEquals(parsed.msg, "m");
  assertEquals(parsed.k, "v");
});

Deno.test("logger: child merges base fields", () => {
  const log = createLogger("fn").child({ requestId: "abc" });
  const [line] = captureStdout(() => log.info("m", { extra: 1 }));
  const parsed = JSON.parse(line);
  assertEquals(parsed.requestId, "abc");
  assertEquals(parsed.extra, 1);
});

Deno.test("logger: handles circular refs without throwing", () => {
  const log = createLogger("fn");
  const a: Record<string, unknown> = {};
  a.self = a;
  const lines = captureStdout(() => log.error("boom", { a }));
  assertEquals(lines.length, 1);
  const parsed = JSON.parse(lines[0]);
  assertEquals(parsed._serialization_error, true);
  assertEquals(parsed.lvl, "error");
});
