import { test, expect } from "./fixtures/auth";

/**
 * C-Level Audit Suite
 *
 * Verifica esaustiva delle rotte chiave della piattaforma con l'utente E2E
 * dedicato (e2e-test@ralphhub.local) sul brand E2E_TEST. Pensata per girare
 * sia in locale che in CI come "smoke esteso" pre-release.
 *
 *   E2E_EMAIL=e2e-test@ralphhub.local \
 *   E2E_PASSWORD='E2E_Test_2026!Secure' \
 *   E2E_BRAND_NAME=E2E_TEST \
 *   PW_BASE_URL=https://id-preview--<id>.lovable.app \
 *   bunx playwright test e2e/c-level-audit.spec.ts
 *
 * Tag: @audit
 */

const email = process.env.E2E_EMAIL!;
const password = process.env.E2E_PASSWORD!;
const brand = process.env.E2E_BRAND_NAME ?? "E2E_TEST";

type RouteCheck = {
  path: string;
  module: string;
  expectText?: RegExp;
  shouldRender?: (body: string) => boolean;
};

const ROUTES: RouteCheck[] = [
  // Core CRM
  { path: "/dashboard", module: "Dashboard" },
  { path: "/contacts", module: "Contatti", expectText: /Contatti/i },
  { path: "/pipeline", module: "Pipeline" },
  { path: "/appointments", module: "Appuntamenti", expectText: /Appuntamenti/i },
  { path: "/appointments/calendar", module: "Calendario Appuntamenti" },
  { path: "/appointments/ops-board", module: "Ops Board" },
  { path: "/tickets", module: "Ticket" },
  { path: "/chat", module: "Chat" },
  { path: "/sales", module: "Vendite" },
  { path: "/products", module: "Prodotti" },
  { path: "/azienda", module: "Azienda" },

  // Marketing
  { path: "/marketing", module: "Marketing Dashboard" },
  { path: "/marketing/leads", module: "Lead Marketing", expectText: /Lead/i },
  { path: "/marketing/campagne", module: "Campagne" },
  { path: "/marketing/costi", module: "Costi Marketing" },
  { path: "/marketing/report", module: "Report Marketing" },

  // Admin / Governance
  { path: "/admin/ai", module: "Admin AI" },
  { path: "/admin/ai-metrics", module: "AI Metrics" },
  { path: "/admin/webhooks", module: "Admin Webhooks" },
  { path: "/admin/dlq", module: "DLQ Dashboard" },
  { path: "/admin/contacts-dedup", module: "Contacts Dedup" },
  { path: "/admin/data-quality", module: "Data Quality" },
  { path: "/admin/slo-board", module: "SLO Board", expectText: /SLO/i },
  { path: "/admin/audit", module: "Audit Log" },
  { path: "/admin/analytics", module: "Analytics" },

  // Settings / Team
  { path: "/settings", module: "Impostazioni" },
  { path: "/settings/security", module: "Sicurezza" },
  { path: "/team", module: "Team" },
  { path: "/notifications", module: "Notifiche" },
];

test.describe("@audit C-Level full route audit", () => {
  test.beforeEach(async ({ login, selectBrandIfNeeded }) => {
    await login(email, password);
    await selectBrandIfNeeded(brand);
  });

  for (const route of ROUTES) {
    test(`renders ${route.module} (${route.path})`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
      });

      const resp = await page.goto(route.path, { waitUntil: "domcontentloaded" });
      // 404/500 from server is hard fail
      expect(resp?.status() ?? 0, `HTTP for ${route.path}`).toBeLessThan(400);

      // Wait for app shell to settle
      await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

      // Must NOT show framework 404 page
      const body = await page.locator("body").innerText();
      expect(body, `${route.path} shows 404 page`).not.toMatch(/Page not found/i);

      // Must have non-trivial content
      expect(body.length, `${route.path} body too small`).toBeGreaterThan(50);

      if (route.expectText) {
        expect(body, `${route.path} missing expected text`).toMatch(route.expectText);
      }

      // No critical runtime errors
      const critical = errors.filter(
        (e) =>
          !/ResizeObserver|Non-Error promise rejection|favicon|Hydration/i.test(e),
      );
      expect(critical, `${route.path} runtime errors:\n${critical.join("\n")}`)
        .toEqual([]);
    });
  }
});
