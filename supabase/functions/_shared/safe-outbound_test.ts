// Regression tests for SSRF guard (C12).
// Run: deno test --allow-net supabase/functions/_shared/safe-outbound_test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assertSafeUrl } from "./safe-outbound.ts";

Deno.test("rejects non-https scheme", async () => {
  const r = await assertSafeUrl("http://example.com/hook");
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.error, "non_https");
});

Deno.test("allows http when allowHttp=true", async () => {
  const r = await assertSafeUrl("http://example.com/hook", { allowHttp: true });
  // DNS may resolve to public IPs in CI; we only assert it's not 'non_https'.
  if (!r.ok) {
    assertEquals(r.error !== "non_https", true);
  }
});

Deno.test("rejects javascript: scheme", async () => {
  const r = await assertSafeUrl("javascript:alert(1)");
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.error, "non_https");
});

Deno.test("rejects file: scheme", async () => {
  const r = await assertSafeUrl("file:///etc/passwd");
  assertEquals(r.ok, false);
});

Deno.test("rejects malformed URL", async () => {
  const r = await assertSafeUrl("not a url");
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.error, "invalid_url");
});

Deno.test("rejects localhost host", async () => {
  const r = await assertSafeUrl("https://localhost/x");
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.error, "host_blocked");
});

Deno.test("rejects AWS metadata IP literal", async () => {
  const r = await assertSafeUrl("https://169.254.169.254/latest/meta-data/");
  assertEquals(r.ok, false);
  // Either host_blocked (string match) or private_ip
  if (!r.ok) {
    const hit = r.error === "host_blocked" || r.error === "private_ip";
    assertEquals(hit, true);
  }
});

Deno.test("rejects GCP metadata host", async () => {
  const r = await assertSafeUrl("https://metadata.google.internal/x");
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.error, "host_blocked");
});

Deno.test("rejects loopback IPv4 literal", async () => {
  const r = await assertSafeUrl("https://127.0.0.1/admin");
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.error, "private_ip");
});

Deno.test("rejects RFC1918 10/8 literal", async () => {
  const r = await assertSafeUrl("https://10.0.0.5/");
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.error, "private_ip");
});

Deno.test("rejects RFC1918 192.168 literal", async () => {
  const r = await assertSafeUrl("https://192.168.1.1/");
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.error, "private_ip");
});

Deno.test("rejects RFC1918 172.16/12 literal", async () => {
  const r = await assertSafeUrl("https://172.16.5.5/");
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.error, "private_ip");
});

Deno.test("rejects link-local 169.254/16 literal", async () => {
  const r = await assertSafeUrl("https://169.254.10.10/");
  assertEquals(r.ok, false);
});

Deno.test("rejects CGNAT 100.64/10 literal", async () => {
  const r = await assertSafeUrl("https://100.64.0.1/");
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.error, "private_ip");
});

Deno.test("rejects IPv6 loopback ::1", async () => {
  const r = await assertSafeUrl("https://[::1]/x");
  assertEquals(r.ok, false);
});

Deno.test("rejects IPv6 ULA fc00::/7", async () => {
  const r = await assertSafeUrl("https://[fc00::1]/x");
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.error, "private_ip");
});

Deno.test("rejects IPv6 link-local fe80::/10", async () => {
  const r = await assertSafeUrl("https://[fe80::1]/x");
  assertEquals(r.ok, false);
});

Deno.test("rejects IPv4-mapped IPv6 to private", async () => {
  const r = await assertSafeUrl("https://[::ffff:127.0.0.1]/x");
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.error, "private_ip");
});
