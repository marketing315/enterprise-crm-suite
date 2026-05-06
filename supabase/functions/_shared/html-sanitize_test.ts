// Deno test per F1 — html-sanitize edge helpers.
// Run: deno test supabase/functions/_shared/html-sanitize_test.ts
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { escapeHtml, safeHrefHtml } from "./html-sanitize.ts";

Deno.test("escapeHtml neutralizza tag e attributi", () => {
  assertEquals(
    escapeHtml(`<script>alert("x")</script>`),
    "&lt;script&gt;alert(&quot;x&quot;)&lt;&#x2F;script&gt;",
  );
  assertEquals(escapeHtml(`o'brien`), "o&#39;brien");
  assertEquals(escapeHtml(null), "");
  assertEquals(escapeHtml(undefined), "");
});

Deno.test("safeHrefHtml blocca javascript: e varianti", () => {
  for (const bad of [
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    " javascript:alert(1)",
    "\tjavascript:alert(1)",
    "java\tscript:alert(1)",
    "\u0000javascript:alert(1)",
    "data:text/html,<script>1</script>",
    "vbscript:msgbox()",
    "file:///etc/passwd",
    "blob:https://x/abc",
  ]) {
    assertEquals(safeHrefHtml(bad), "#", `should block: ${bad}`);
  }
});

Deno.test("safeHrefHtml permette http/https/mailto/tel ed escapa", () => {
  const safe = safeHrefHtml("https://example.com/x?a=1&b=2");
  // L'URL è HTML-escaped (compresi / e &)
  assertStringIncludes(safe, "https:&#x2F;&#x2F;example.com");
  assertStringIncludes(safe, "&amp;");
  assertEquals(safeHrefHtml("mailto:a@b.c"), "mailto:a@b.c");
  assertStringIncludes(safeHrefHtml("tel:+39000"), "tel:+39000");
});

Deno.test("safeHrefHtml rifiuta non-stringhe e relativi", () => {
  assertEquals(safeHrefHtml(null), "#");
  assertEquals(safeHrefHtml(undefined), "#");
  assertEquals(safeHrefHtml(123), "#");
  assertEquals(safeHrefHtml("/relative/path"), "#");
});
