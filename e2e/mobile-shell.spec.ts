/**
 * Mobile Shell — Playwright smoke suite per il redesign mobile (Fasi F1-F7).
 *
 * Non richiede credenziali E2E_*: copre le superfici pubbliche e il guard di
 * autenticazione in viewport mobile (Pixel 5 — 393x851, < 768px → bucket
 * mobile di `useIsMobile`). I test autenticati restano nelle suite
 * `smoke.spec.ts` e `revenue-critical/` che usano la fixture auth.
 *
 * Obiettivo: bloccare regressioni di boot (errori console fatali, overflow
 * orizzontale, viewport meta mancante, redirect auth rotto) sulla shell
 * mobile.
 */
import { test, expect, devices, type ConsoleMessage } from "@playwright/test";

test.use({
  ...devices["Pixel 5"],
  launchOptions: { executablePath: "/bin/chromium" },
});

/**
 * Errori console accettabili: rumore noto del preview che NON è un bug
 * dell'applicazione (è un warning del runtime browser su direttive CSP che
 * vanno consegnate via HTTP header, non via <meta>; resta lì per copertura
 * difensiva, vedi commit F2-F5 frontend hardening).
 */
const IGNORED_CONSOLE = [
  /favicon/i,
  /sourcemap/i,
  /service.?worker/i,
  /manifest/i,
  /workbox/i,
  /Failed to load resource.*404/i,
  /Download the React DevTools/i,
  /Content Security Policy directive 'frame-ancestors' is ignored/i,
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

    const viewportMeta = await page
      .locator('meta[name="viewport"]')
      .getAttribute("content");
    expect(viewportMeta).toMatch(/width=device-width/);

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);

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
        .waitForURL(/\/(login|select-brand)/, { timeout: 15_000 })
        .catch(() => {});
      expect(page.url(), `redirect mancante per ${route}`).toMatch(
        /\/(login|select-brand)/,
      );
    }

    const fatalErrors = collectConsoleErrors(consoleMessages);
    expect(
      fatalErrors,
      `errori console fatali:\n${fatalErrors.join("\n")}`,
    ).toEqual([]);
  });

  test("M3: bundle mobile carica /login senza errori React/runtime fatali", async ({
    page,
  }) => {
    const consoleMessages: ConsoleMessage[] = [];
    const pageErrors: Error[] = [];
    page.on("console", (m) => consoleMessages.push(m));
    page.on("pageerror", (e) => pageErrors.push(e));

    await page.goto("/login");
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => {});

    const fatalErrors = collectConsoleErrors(consoleMessages);
    expect(
      pageErrors,
      `pageerror:\n${pageErrors.map((e) => e.message).join("\n")}`,
    ).toEqual([]);
    expect(fatalErrors, `console:\n${fatalErrors.join("\n")}`).toEqual([]);
  });

  test("M4: input e submit della login hanno altezza ≥ 44px (tap-target a11y)", async ({
    page,
  }) => {
    // Allineato al resto della shell mobile (F7.2): i controlli primari
    // raggiungono il vincolo WCAG 2.5.5 (44×44) su viewport < md.
    await page.goto("/login");
    await page.waitForSelector('input[type="email"]', { timeout: 10_000 });
    const targets = [
      'input[type="email"]',
      'input[type="password"]',
      'button[type="submit"]',
    ];
    for (const sel of targets) {
      const box = await page.locator(sel).first().boundingBox();
      expect(box, `bounding box mancante per ${sel}`).not.toBeNull();
      expect(box!.height, `${sel} height`).toBeGreaterThanOrEqual(44);
    }
  });
});
