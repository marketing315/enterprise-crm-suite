import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { safeJson, safeFetchJson } from "./safe-json.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function textResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "text/html" } });
}

Deno.test("safeJson: parses valid 200 JSON", async () => {
  const r = await safeJson<{ a: number }>(jsonResponse({ a: 1 }));
  assert(r.ok);
  if (r.ok) {
    assertEquals(r.data.a, 1);
    assertEquals(r.status, 200);
    assertEquals(r.fallback, false);
  }
});

Deno.test("safeJson: HTML body on 200 → JSON_PARSE_ERROR + fallback", async () => {
  const r = await safeJson(textResponse("<html>throttled</html>", 200));
  assert(!r.ok);
  if (!r.ok) {
    assertEquals(r.error, "JSON_PARSE_ERROR");
    assertEquals(r.fallback, true);
    assert(r.body.includes("throttled"));
  }
});

Deno.test("safeJson: empty 200 body → EMPTY_BODY + fallback", async () => {
  const r = await safeJson(new Response("", { status: 200 }));
  assert(!r.ok);
  if (!r.ok) {
    assertEquals(r.error, "EMPTY_BODY");
    assertEquals(r.fallback, true);
  }
});

Deno.test("safeJson: 500 with text body → HTTP_ERROR + fallback", async () => {
  const r = await safeJson(textResponse("Bad gateway", 502));
  assert(!r.ok);
  if (!r.ok) {
    assertEquals(r.error, "HTTP_ERROR");
    assertEquals(r.fallback, true);
    assertEquals(r.status, 502);
  }
});

Deno.test("safeJson: 400 client error → HTTP_ERROR but NOT fallback", async () => {
  const r = await safeJson(jsonResponse({ error: "bad" }, 400));
  assert(!r.ok);
  if (!r.ok) {
    assertEquals(r.error, "HTTP_ERROR");
    assertEquals(r.fallback, false);
  }
});

Deno.test("safeJson: 429 rate-limit → HTTP_ERROR + fallback (transient)", async () => {
  const r = await safeJson(textResponse("rate limited", 429));
  assert(!r.ok);
  if (!r.ok) {
    assertEquals(r.fallback, true);
  }
});

Deno.test("safeJson: body truncated above limit", async () => {
  const huge = "x".repeat(5000);
  const r = await safeJson(textResponse(huge, 502));
  assert(!r.ok);
  if (!r.ok) {
    assert(r.body.length < 5000);
    assert(r.body.includes("truncated"));
  }
});

Deno.test("safeFetchJson: network error → NETWORK_ERROR + fallback", async () => {
  // Unreachable host triggers fetch rejection.
  const r = await safeFetchJson("http://127.0.0.1:1/nope", { signal: AbortSignal.timeout(500) });
  assert(!r.ok);
  if (!r.ok) {
    assertEquals(r.error, "NETWORK_ERROR");
    assertEquals(r.fallback, true);
  }
});
