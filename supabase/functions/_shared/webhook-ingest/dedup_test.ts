import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { computeFingerprint, mapErrorToDlqReason } from "./dedup.ts";

Deno.test("computeFingerprint: prefers signature when present", async () => {
  const fp = await computeFingerprint("sha256=abc", "ignored body");
  assertEquals(fp, "sig:sha256=abc");
});

Deno.test("computeFingerprint: hashes body otherwise", async () => {
  const fp = await computeFingerprint(null, "hello");
  assertEquals(fp, "body:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
});

Deno.test("computeFingerprint: capped at 256 chars", async () => {
  const fp = await computeFingerprint("x".repeat(500), "");
  assertEquals(fp.length, 256);
});

Deno.test("mapErrorToDlqReason: known mappings", () => {
  assertEquals(mapErrorToDlqReason(null), null);
  assertEquals(mapErrorToDlqReason("invalid_json"), "invalid_json");
  assertEquals(mapErrorToDlqReason("schema_validation_failed: foo"), "schema_validation_failed");
  assertEquals(mapErrorToDlqReason("invalid_signature"), "signature_failed");
  assertEquals(mapErrorToDlqReason("invalid_signature_format"), "signature_failed");
  assertEquals(mapErrorToDlqReason("rate_limited"), "rate_limited");
  assertEquals(mapErrorToDlqReason("missing_phone"), "missing_required");
  assertEquals(mapErrorToDlqReason("ai_extraction_x"), "ai_extraction_failed");
  assertEquals(mapErrorToDlqReason("contact_creation_failed: db"), "contact_creation_failed");
});

Deno.test("mapErrorToDlqReason: auth failures NOT queued", () => {
  // These must return null so they aren't sent to DLQ
  assertEquals(mapErrorToDlqReason("invalid_api_key"), null);
  assertEquals(mapErrorToDlqReason("source_not_found"), null);
  assertEquals(mapErrorToDlqReason("missing_credentials"), null);
});
