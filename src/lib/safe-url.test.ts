import { describe, it, expect } from "vitest";
import { sanitizeUrl, safeHref } from "./safe-url";

describe("sanitizeUrl — F1 XSS guard", () => {
  it("blocca javascript: classico", () => {
    expect(sanitizeUrl("javascript:alert(1)")).toBeNull();
    expect(sanitizeUrl("JaVaScRiPt:alert(1)")).toBeNull();
  });

  it("blocca javascript: con whitespace/control chars", () => {
    expect(sanitizeUrl(" javascript:alert(1)")).toBeNull();
    expect(sanitizeUrl("\tjavascript:alert(1)")).toBeNull();
    expect(sanitizeUrl("java\tscript:alert(1)")).toBeNull();
    expect(sanitizeUrl("\u0000javascript:alert(1)")).toBeNull();
  });

  it("blocca data:, vbscript:, file:, blob:", () => {
    expect(sanitizeUrl("data:text/html,<script>x</script>")).toBeNull();
    expect(sanitizeUrl("vbscript:msgbox()")).toBeNull();
    expect(sanitizeUrl("file:///etc/passwd")).toBeNull();
    expect(sanitizeUrl("blob:https://x/abc")).toBeNull();
  });

  it("permette http/https/mailto/tel", () => {
    expect(sanitizeUrl("https://example.com/x")).toBe("https://example.com/x");
    expect(sanitizeUrl("http://x.it")).toBe("http://x.it/");
    expect(sanitizeUrl("mailto:a@b.c")).toBe("mailto:a@b.c");
    expect(sanitizeUrl("tel:+39000")).toBe("tel:+39000");
  });

  it("permette URL relativi quando allowRelative", () => {
    expect(sanitizeUrl("/contacts/123")).toBe("/contacts/123");
    expect(sanitizeUrl("#anchor")).toBe("#anchor");
    expect(sanitizeUrl("../foo")).toBe("../foo");
  });

  it("blocca relativi se allowRelative=false", () => {
    expect(sanitizeUrl("/x", { allowRelative: false })).toBeNull();
  });

  it("rispetta allowedProtocols custom", () => {
    expect(sanitizeUrl("mailto:a@b", { allowedProtocols: ["https"] })).toBeNull();
    expect(sanitizeUrl("https://x.it", { allowedProtocols: ["https"] })).toBe("https://x.it/");
  });

  it("safeHref ritorna stringa vuota su input pericoloso", () => {
    expect(safeHref("javascript:alert(1)")).toBe("");
    expect(safeHref(undefined)).toBe("");
    expect(safeHref(null)).toBe("");
  });

  it("rifiuta non-stringhe", () => {
    expect(sanitizeUrl(null)).toBeNull();
    expect(sanitizeUrl(undefined)).toBeNull();
    expect(sanitizeUrl(123)).toBeNull();
    expect(sanitizeUrl({})).toBeNull();
  });
});
