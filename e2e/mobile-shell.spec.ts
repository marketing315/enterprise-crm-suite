/**
 * Mobile Shell — Playwright smoke suite per il redesign mobile (Fasi F1-F7).
 *
 * Non richiede credenziali E2E_*: copre le superfici pubbliche e il guard di
 * autenticazione in viewport mobile (iPhone 12 — 390x844, < 768px → bucket
 * mobile di `useIsMobile`). I test autenticati restano nelle suite
 * `smoke.spec.ts` e `revenue-critical/` che usano la fixture auth.
 *
 * Obiettivo: bloccare regressioni di boot (errori console fatali, overflow
 * orizzontale, viewport meta mancante, redirect auth rotto, skip-link a11y
 * H11 assente) sulla shell mobile.
 */
import { test, expect, devices, type ConsoleMessage } from "@playwright/test";

test.use({ ...devices["iPhone 12"] });

/** Errori console accettabili: rumore noto del preview (favicon, sourcemap, sw). */
const IGNORED_CONSOLE = [
  /favicon/i,
  /sourcemap/i,
  /service.?worker/i,
  /manifest/i,
  /workbox/i,
  /Failed to load resource.*404/i,
  /Download the React DevTools/i,
];

function collectConsoleErrors(messages: ConsoleMessage[]) {
  return messages
    .filter((m) => m.type() === "error")
    .map((m) => m.text())
    .filter((t) => !IGNORED_CONSOLE.some((re) => re.test(t)));
}

test.describe("@mobile Mobile shell smoke", () => {
  test("M1: viewport meta mobile corretto + niente scroll orizzontale su /login", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");

    // viewport meta presente e device-width
    const viewportMeta = await page
      .locator('meta[name="viewport"]')
      .getAttribute("content");
    expect(viewportMeta).toMatch(/width=device-width/);

    // no overflow orizzontale: scrollWidth deve essere ≤ clientWidth (+1 px tolleranza)
    const overflow = await page.evaluate(() => {
      const html = document.documentElement;
      return { scrollWidth: html.scrollWidth, clientWidth: html.clientWidth };
    });
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);

    // form di login renderizzato e cliccabile
    await expect(page.locator('input[type="email"]')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test("M2: rotte protette redirigono a /login senza errori console fatali", async ({
    page,
  }) => {
    const consoleMessages: ConsoleMessage[] = [];
    page.on("console", (m) => consoleMessages.push(m));

    const protectedRoutes = [
      "/dashboard",
      "/pipeline",
      "/tickets",
      "/chat",
      "/appointments",
      "/contacts",
    ];

    for (const route of protectedRoutes) {
      await page.goto(route);
      await page
        .waitForURL(/\/login/, { timeout: 15_000 })
        .catch(() => {
          // tollera: la pagina potrebbe risolvere via select-brand prima
        });
      expect(page.url(), `redirect mancante per ${route}`).toMatch(
        /\/(login|select-brand)/,
      );
    }

    const fatalErrors = collectConsoleErrors(consoleMessages);
    expect(fatalErrors, `errori console fatali:\n${fatalErrors.join("\n")}`).toEqual(
      [],
    );
  });

  test("M3: skip-link a11y (H11) presente e raggiungibile via Tab", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");

    // Il primo focus tabbabile deve essere lo skip-link (H11)
    await page.keyboard.press("Tab");
    const skipLink = page.locator('a[href="#main-content"]').first();
    await expect(skipLink).toBeFocused({ timeout: 5_000 });
  });

  test("M4: bundle mobile carica senza errori React/runtime fatali", async ({
    page,
  }) => {
    const consoleMessages: ConsoleMessage[] = [];
    const pageErrors: Error[] = [];
    page.on("console", (m) => consoleMessages.push(m));
    page.on("pageerror", (e) => pageErrors.push(e));

    await page.goto("/login");
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    const fatalErrors = collectConsoleErrors(consoleMessages);
    expect(pageErrors, `pageerror:\n${pageErrors.map((e) => e.message).join("\n")}`)
      .toEqual([]);
    expect(fatalErrors, `console:\n${fatalErrors.join("\n")}`).toEqual([]);
  });

  test("M5: tap-target minimo 44px sui controlli interattivi della login (F7.2)", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.waitForSelector('button[type="submit"]', { timeout: 10_000 });

    const submit = page.locator('button[type="submit"]').first();
    const box = await submit.boundingBox();
    expect(box, "submit button senza bounding box").not.toBeNull();
    // tolleranza 1px per arrotondamenti sub-pixel
    expect(box!.height).toBeGreaterThanOrEqual(43);
  });
});
