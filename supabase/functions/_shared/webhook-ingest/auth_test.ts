import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { extractApiKey, verifyApiKey, checkReplayTimestamp } from "./auth.ts";
import { hashSha256 } from "./hmac.ts";

Deno.test("extractApiKey: header has highest priority", () => {
  assertEquals(
    extractApiKey({ headerKey: "h", queryKey: "q", pathKey: "p", bodyKey: "b" }),
    "h",
  );
});

Deno.test("extractApiKey: falls through in order", () => {
  assertEquals(extractApiKey({ headerKey: null, queryKey: "q", pathKey: "p", bodyKey: "b" }), "q");
  assertEquals(extractApiKey({ headerKey: null, queryKey: null, pathKey: "p", bodyKey: "b" }), "p");
  assertEquals(extractApiKey({ headerKey: null, queryKey: null, pathKey: null, bodyKey: "b" }), "b");
  assertEquals(extractApiKey({ headerKey: null, queryKey: null, pathKey: null, bodyKey: null }), null);
});

Deno.test("extractApiKey: trims and ignores empty strings", () => {
  assertEquals(extractApiKey({ headerKey: "  ", queryKey: "q", pathKey: null, bodyKey: null }), "q");
});

Deno.test("verifyApiKey: matching key passes", async () => {
  const key = "supersecret-key-123";
  const stored = await hashSha256(key);
  assert(await verifyApiKey(key, stored));
  assert(!(await verifyApiKey("nope", stored)));
});

Deno.test("checkReplayTimestamp: missing header", () => {
  const r = checkReplayTimestamp(null, 300, 1700000000);
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.reason, "missing_timestamp");
});

Deno.test("checkReplayTimestamp: NaN", () => {
  const r = checkReplayTimestamp("not-a-number", 300, 1700000000);
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.reason, "invalid_timestamp_format");
});

Deno.test("checkReplayTimestamp: within window", () => {
  const r = checkReplayTimestamp("1700000000", 300, 1700000200);
  assertEquals(r.ok, true);
});

Deno.test("checkReplayTimestamp: outside window", () => {
  const r = checkReplayTimestamp("1700000000", 300, 1700000400);
  assertEquals(r.ok, false);
  if (!r.ok) {
    assertEquals(r.reason, "replay_detected");
    assertEquals(r.details?.diff, 400);
  }
});

Deno.test("checkReplayTimestamp: past or future symmetric", () => {
  const r = checkReplayTimestamp("1700000400", 300, 1700000000);
  assertEquals(r.ok, false);
});
