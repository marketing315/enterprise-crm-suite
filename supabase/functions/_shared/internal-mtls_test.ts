/**
 * C5 — Internal mTLS-equivalent helper unit tests.
 * Replay-guard is exercised via an in-memory mock supabase client.
 */
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { signInternalRequest, verifyInternalRequest } from "./internal-mtls.ts";

Deno.env.set("INTERNAL_SERVICE_TOKEN", "test-secret-32-bytes-minimum-entropy-xx");

function makeMockSupa() {
  const seen = new Set<string>();
  return {
    from(_t: string) {
      return {
        async insert(row: { nonce: string }) {
          if (seen.has(row.nonce)) return { error: { code: "23505", message: "dup" } };
          seen.add(row.nonce);
          return { error: null };
        },
      };
    },
  };
}

Deno.test("signed request round-trips and replay is rejected", async () => {
  const url = "https://x.functions.supabase.co/trace-ingest?run=1";
  const body = JSON.stringify({ hello: "world" });
  const headers = await signInternalRequest({
    caller: "webhook-ingest",
    method: "POST",
    url,
    body,
  });
  const supa = makeMockSupa() as unknown as Parameters<typeof verifyInternalRequest>[0]["supabase"];

  const req1 = new Request(url, { method: "POST", headers, body });
  const r1 = await verifyInternalRequest({
    req: req1,
    rawBody: body,
    allowedCallers: ["webhook-ingest"],
    supabase: supa,
  });
  assertEquals(r1.ok, true);
  if (r1.ok) assertEquals(r1.mode, "signed");

  // Replay with the same headers + body must fail
  const req2 = new Request(url, { method: "POST", headers, body });
  const r2 = await verifyInternalRequest({
    req: req2,
    rawBody: body,
    allowedCallers: ["webhook-ingest"],
    supabase: supa,
  });
  assertEquals(r2.ok, false);
  if (!r2.ok) assertEquals(r2.error, "replayed nonce");
});

Deno.test("disallowed caller is rejected with 403", async () => {
  const url = "https://x.functions.supabase.co/trace-ingest";
  const headers = await signInternalRequest({ caller: "evil", method: "POST", url, body: "" });
  const req = new Request(url, { method: "POST", headers, body: "" });
  const r = await verifyInternalRequest({
    req,
    rawBody: "",
    allowedCallers: ["webhook-ingest"],
    supabase: null,
  });
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.status, 403);
});

Deno.test("tampered body is rejected", async () => {
  const url = "https://x.functions.supabase.co/x";
  const body = JSON.stringify({ a: 1 });
  const headers = await signInternalRequest({ caller: "webhook-ingest", method: "POST", url, body });
  const req = new Request(url, { method: "POST", headers, body: JSON.stringify({ a: 2 }) });
  const r = await verifyInternalRequest({
    req,
    rawBody: JSON.stringify({ a: 2 }),
    allowedCallers: ["webhook-ingest"],
    supabase: null,
  });
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.error, "bad signature");
});

Deno.test("legacy token still accepted (backwards-compatible)", async () => {
  const url = "https://x.functions.supabase.co/x";
  const req = new Request(url, {
    method: "POST",
    headers: { "x-internal-token": "test-secret-32-bytes-minimum-entropy-xx" },
    body: "",
  });
  const r = await verifyInternalRequest({
    req,
    rawBody: "",
    allowedCallers: ["webhook-ingest"],
    supabase: null,
  });
  assertEquals(r.ok, true);
  if (r.ok) assertEquals(r.mode, "legacy");
});
