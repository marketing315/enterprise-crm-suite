import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { SafeMarkdown } from "./SafeMarkdown";

const PAYLOADS = [
  "<script>alert('xss')</script>Hello",
  "<img src=x onerror=alert(1)>",
  "[click](javascript:alert(1))",
  "[click](JaVaScRiPt:alert(1))",
  "[click](java\tscript:alert(1))",
  "[click](data:text/html,<script>1</script>)",
  "[click](vbscript:msgbox)",
  "<iframe src='javascript:alert(1)'></iframe>",
  "<a href='javascript:alert(1)'>x</a>",
  "<svg onload=alert(1)>",
  "![x](javascript:alert(1))",
];

describe("SafeMarkdown — F1 XSS", () => {
  for (const payload of PAYLOADS) {
    it(`neutralizza payload: ${payload.slice(0, 40)}`, () => {
      const { container } = render(<SafeMarkdown>{payload}</SafeMarkdown>);
      const html = container.innerHTML.toLowerCase();
      // Niente script/iframe/event handlers
      expect(html).not.toContain("<script");
      expect(html).not.toContain("<iframe");
      expect(html).not.toMatch(/on\w+\s*=/);
      // Nessun href javascript:/data:/vbscript:
      const anchors = container.querySelectorAll("a");
      anchors.forEach((a) => {
        const href = (a.getAttribute("href") || "").toLowerCase().replace(/\s/g, "");
        expect(href.startsWith("javascript:")).toBe(false);
        expect(href.startsWith("data:")).toBe(false);
        expect(href.startsWith("vbscript:")).toBe(false);
      });
      // Nessuna img con src pericoloso
      const imgs = container.querySelectorAll("img");
      imgs.forEach((img) => {
        const src = (img.getAttribute("src") || "").toLowerCase().replace(/\s/g, "");
        expect(src.startsWith("javascript:")).toBe(false);
        expect(src.startsWith("data:")).toBe(false);
      });
    });
  }

  it("preserva markdown sicuro (link https + bold)", () => {
    const { container } = render(<SafeMarkdown>{"**ciao** [link](https://example.com)"}</SafeMarkdown>);
    expect(container.querySelector("strong")?.textContent).toBe("ciao");
    const a = container.querySelector("a");
    expect(a?.getAttribute("href")).toBe("https://example.com/");
    expect(a?.getAttribute("rel")).toContain("noopener");
  });

  it("ritorna null su input vuoto", () => {
    const { container } = render(<SafeMarkdown>{null}</SafeMarkdown>);
    expect(container.innerHTML).toBe("");
  });
});
