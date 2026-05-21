import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Button } from "@/components/ui/button";

/**
 * H11 / Mobile A11y guard: i pulsanti di azione primaria su mobile
 * devono raggiungere almeno 44x44px (WCAG 2.5.5 Target Size).
 * Le size `icon`, `icon-mobile` e `fab` sono gli helper ufficiali.
 */
describe("Button touch target sizing (mobile)", () => {
  it("size=icon usa h-11 w-11 (44px) su mobile", () => {
    const { getByRole } = render(<Button size="icon" aria-label="x" />);
    const cls = getByRole("button").className;
    expect(cls).toMatch(/\bh-11\b/);
    expect(cls).toMatch(/\bw-11\b/);
  });

  it("size=icon-mobile è sempre 44px", () => {
    const { getByRole } = render(<Button size="icon-mobile" aria-label="x" />);
    const cls = getByRole("button").className;
    expect(cls).toContain("h-11");
    expect(cls).toContain("w-11");
  });

  it("size=fab è 56px e rounded-full", () => {
    const { getByRole } = render(<Button size="fab" aria-label="add" />);
    const cls = getByRole("button").className;
    expect(cls).toContain("h-14");
    expect(cls).toContain("w-14");
    expect(cls).toContain("rounded-full");
  });
});
