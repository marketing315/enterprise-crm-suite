import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { appsecretProof, META_GRAPH_VERSION, withProof } from "./meta-graph.ts";

Deno.test("META_GRAPH_VERSION is v21.0", () => {
  assertEquals(META_GRAPH_VERSION, "v21.0");
});

Deno.test("appsecretProof returns null when secret missing", async () => {
  const v = await appsecretProof("token", "");
  assertEquals(v, null);
});

Deno.test("appsecretProof matches Meta spec HMAC-SHA256(secret, token) hex", async () => {
  // Reference vector: HMAC-SHA256("secret", "token") = 0e3aebbb...
  const v = await appsecretProof("token", "secret");
  assertEquals(typeof v, "string");
  assertEquals(v!.length, 64);
  // Pre-computed expected
  assertEquals(v, "e941110e3d2bfe82621f0e3e1434730d7305d106c5f68c87165d0b27a4611a4a");
});

Deno.test("withProof adds access_token and appsecret_proof when secret provided", async () => {
  const out = await withProof(new URL("https://graph.facebook.com/v21.0/me"), "tok", "sec");
  const u = new URL(out);
  assertEquals(u.searchParams.get("access_token"), "tok");
  assertEquals(u.searchParams.get("appsecret_proof")?.length, 64);
});

Deno.test("withProof skips appsecret_proof when secret missing", async () => {
  const out = await withProof(new URL("https://graph.facebook.com/v21.0/me"), "tok", null);
  const u = new URL(out);
  assertEquals(u.searchParams.get("access_token"), "tok");
  assertEquals(u.searchParams.get("appsecret_proof"), null);
});
