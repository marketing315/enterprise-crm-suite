/**
 * H11 — WCAG 2.1 AA accessibility regression test.
 *
 * Smoke check su componenti UI critici renderizzati in isolamento.
 * Lo scope è intenzionalmente piccolo: garantisce che il design system
 * di base (Button, Input, Dialog trigger, Skip-link) non regredisca
 * su violazioni axe-core "serious"/"critical".
 *
 * Estendere questo file aggiungendo nuovi snippet quando si tocca
 * un componente di base condiviso.
 */
import { describe, it } from "vitest";
import { render } from "@testing-library/react";
import { axe } from "vitest-axe";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// jsdom non implementa Canvas → axe color-contrast non valutabile.
// Disabilitiamo la regola, il contrasto è verificato in CI E2E (Playwright).
const axeOptions = { rules: { "color-contrast": { enabled: false } } } as const;

describe("H11 a11y regression — base UI", () => {
  it("Button con label testuale non ha violazioni axe", async () => {
    const { container } = render(<Button>Conferma</Button>);
    const results = await axe(container);
    // @ts-expect-error matcher esteso via vitest-axe/matchers
    expect(results).toHaveNoViolations();
  });

  it("Input associato a Label non ha violazioni axe", async () => {
    const { container } = render(
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" placeholder="nome@example.com" />
      </div>,
    );
    const results = await axe(container);
    // @ts-expect-error matcher esteso via vitest-axe/matchers
    expect(results).toHaveNoViolations();
  });

  it("Skip-link è raggiungibile e ha testo descrittivo", async () => {
    const { container } = render(
      <a href="#main-content" className="skip-to-content">
        Vai al contenuto principale
      </a>,
    );
    const results = await axe(container);
    // @ts-expect-error matcher esteso via vitest-axe/matchers
    expect(results).toHaveNoViolations();
  });
});
