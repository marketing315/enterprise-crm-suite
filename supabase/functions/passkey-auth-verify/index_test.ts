// AC3 — unit test su passkey-auth-verify: contratto input/HTTP.
// Test profondi su replay/counter/origin richiedono mock di @simplewebauthn/server
// + supabase admin client e sono coperti dagli E2E AC2 (Playwright virtual authenticator).
// Qui validiamo solo la superficie input (405/422/payload shape).

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handler } from "./index.ts";

function post(body: unknown): Request {
  return new Request("http://local/passkey-auth-verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

Deno.test("OPTIONS → 200 + CORS", async () => {
  const res = await handler(
    new Request("http://local/passkey-auth-verify", { method: "OPTIONS" }),
  );
  assertEquals(res.status, 200);
  await res.text();
});

Deno.test("GET → 405 method_not_allowed", async () => {
  const res = await handler(
    new Request("http://local/passkey-auth-verify", { method: "GET" }),
  );
  assertEquals(res.status, 405);
  const j = await res.json();
  assertEquals(j.error, "method_not_allowed");
});

Deno.test("POST senza body → 422 invalid_payload", async () => {
  const res = await handler(
    new Request("http://local/passkey-auth-verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "",
    }),
  );
  assertEquals(res.status, 422);
  const j = await res.json();
  assertEquals(j.error, "invalid_payload");
});

Deno.test("POST body senza credentialId → 422", async () => {
  const res = await handler(
    post({
      challenge: "abc",
      rpId: "localhost",
      origin: "http://localhost",
      authenticatorData: "x",
      clientDataJSON: "x",
      signature: "x",
    }),
  );
  assertEquals(res.status, 422);
  const j = await res.json();
  assertEquals(j.error, "invalid_payload");
});

Deno.test("POST body senza origin → 422", async () => {
  const res = await handler(
    post({
      challenge: "abc",
      rpId: "localhost",
      credentialId: "x",
      authenticatorData: "x",
      clientDataJSON: "x",
      signature: "x",
    }),
  );
  assertEquals(res.status, 422);
});

Deno.test("POST body senza rpId → 422", async () => {
  const res = await handler(
    post({
      challenge: "abc",
      origin: "http://localhost",
      credentialId: "x",
      authenticatorData: "x",
      clientDataJSON: "x",
      signature: "x",
    }),
  );
  assertEquals(res.status, 422);
});
