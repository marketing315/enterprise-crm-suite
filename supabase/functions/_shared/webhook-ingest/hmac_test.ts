import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  hashSha256,
  computeHmacSha256,
  constantTimeCompare,
  verifyHmacSignature,
} from "./hmac.ts";

Deno.test("hashSha256: stable hex digest", async () => {
  const h = await hashSha256("hello");
  assertEquals(h, "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
});

Deno.test("computeHmacSha256: known RFC vector", async () => {
  // HMAC-SHA256("key", "The quick brown fox jumps over the lazy dog")
  const sig = await computeHmacSha256("key", "The quick brown fox jumps over the lazy dog");
  assertEquals(sig, "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8");
});

Deno.test("constantTimeCompare: equal vs different", () => {
  assert(constantTimeCompare("abc", "abc"));
  assert(!constantTimeCompare("abc", "abd"));
  assert(!constantTimeCompare("abc", "abcd"));
});

Deno.test("verifyHmacSignature: standard flow ok", async () => {
  const secret = "topsecret";
  const ts = "1700000000";
  const body = '{"hello":"world"}';
  const expected = await computeHmacSha256(secret, `${ts}.${body}`);
  const result = await verifyHmacSignature({
    bodyText: body,
    secret,
    signatureHeader: `sha256=${expected}`,
    timestampHeader: ts,
    isSystemeIo: false,
  });
  assertEquals(result.ok, true);
});

Deno.test("verifyHmacSignature: invalid format", async () => {
  const result = await verifyHmacSignature({
    bodyText: "x",
    secret: "s",
    signatureHeader: "not-a-signature",
    timestampHeader: "1",
    isSystemeIo: false,
  });
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.reason, "invalid_signature_format");
});

Deno.test("verifyHmacSignature: invalid signature", async () => {
  const secret = "topsecret";
  const ts = "1700000000";
  const body = "abc";
  const wrong = await computeHmacSha256("WRONG", `${ts}.${body}`);
  const result = await verifyHmacSignature({
    bodyText: body,
    secret,
    signatureHeader: `sha256=${wrong}`,
    timestampHeader: ts,
    isSystemeIo: false,
  });
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.reason, "invalid_signature");
});

Deno.test("verifyHmacSignature: systeme.io flow signs raw body, hex only", async () => {
  const secret = "systemekey";
  const body = '{"contact":{"email":"a@b.it"}}';
  const expected = await computeHmacSha256(secret, body);
  const result = await verifyHmacSignature({
    bodyText: body,
    secret,
    signatureHeader: expected.toUpperCase(), // case-insensitive
    timestampHeader: null,
    isSystemeIo: true,
  });
  assertEquals(result.ok, true);
});
